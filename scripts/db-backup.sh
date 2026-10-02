#!/usr/bin/env bash
# نسخة احتياطية كاملة — Sprint 6 · Q14. الإجراء الكامل والجدولة في docs/ops/backup-and-restore.md.
#
#   scripts/db-backup.sh [--skip-storage]
#   scripts/db-backup.sh --schema-only     الهيكل وحده: الجداول والأنواع والدوال والمشغّلات وRLS، بلا أي بيانات
#                                          (backup-<UTC>_schema.sql.gz — لمقارنة البيئات ومراجعة الهيكل. بلا سجل migrations，
#                                          فلا تُهيَّأ منه قاعدة تُدار بـ Prisma: لذلك npx prisma migrate deploy)
#
# الناتج في $BACKUP_DIR (افتراضيًا backups/ — خارج git):
#   backup-<UTC>.sql.gz            مخطط public وبياناته وسجل الـ migrations (pg_dump)
#   backup-<UTC>_auth.sql.gz       حسابات الدخول (auth.users · auth.identities) بيانات فقط
#   backup-<UTC>_storage.tar.gz    حاوية المرفقات + manifest.json بالبصمات (scripts/storage-backup.ts)
#   backup-<UTC>.sha256            بصمات الملفات أعلاه
# BACKUP_GPG_RECIPIENT ⇒ كل ملف يُشفَّر بالمفتاح العام (.gpg). في الإنتاج التشفير إلزامي.
# BACKUP_KEEP_DAYS (افتراضيًا 30) ⇒ تُحذف النسخ الأقدم من المجلد نفسه.
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=scripts/lib/pg-tools.sh
. scripts/lib/pg-tools.sh

SKIP_STORAGE=0
SCHEMA_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --skip-storage) SKIP_STORAGE=1 ;;
    --schema-only) SCHEMA_ONLY=1; SKIP_STORAGE=1 ;;
    *) echo "✗ خيار غير معروف: $arg" >&2; exit 2 ;;
  esac
done

load_db_url
# الهيكل بلا بيانات لا يحمل بيانات شخصية؛ التشفير إلزامي لما فيه بيانات فقط
if is_production && [ "$SCHEMA_ONLY" -eq 0 ] && [ -z "${BACKUP_GPG_RECIPIENT:-}" ]; then
  echo "✗ نسخة إنتاج بلا تشفير مرفوضة: عيّن BACKUP_GPG_RECIPIENT (انظر docs/ops/backup-and-restore.md)." >&2
  exit 1
fi

OUT_DIR="${BACKUP_DIR:-backups}"
TS="$(date -u +%Y-%m-%d_%H%M%S)"
BASE="$OUT_DIR/backup-$TS"
DATA_FLAG=()
if [ "$SCHEMA_ONLY" -eq 1 ]; then
  BASE="${BASE}_schema"
  DATA_FLAG=(--schema-only)
fi
umask 077 # النسخة فيها بيانات شخصية: لصاحبها وحده
mkdir -p "$OUT_DIR"
FILES=()

echo "→ القاعدة (public) …"
# --no-privileges: صلاحيات public ملك المنصة (supabase_admin) ويمنحها كل مشروع جديد؛ إغلاق Data API يُعاد
# بعد الاستعادة من migration الإغلاق نفسه (scripts/db-restore.sh --apply)
pg_tool pg_dump "$DB_URL" --schema=public --no-owner --no-privileges --quote-all-identifiers "${DATA_FLAG[@]}" | gzip -9 > "$BASE.sql.gz"
gzip -t "$BASE.sql.gz"
tables=$(gzip -dc "$BASE.sql.gz" | grep -c '^CREATE TABLE' || true)
# grep -c لا grep -q: الخروج المبكر يقطع gzip بـ SIGPIPE فيفشل الأنبوب كله مع pipefail
migrations=$(gzip -dc "$BASE.sql.gz" | grep -c '_prisma_migrations' || true)
[ "$migrations" -gt 0 ] || { echo "✗ النسخة بلا _prisma_migrations — ليست قاعدة المنصة؟" >&2; exit 1; }
echo "  $tables جدولًا"
FILES+=("$BASE.sql.gz")

if [ "$SCHEMA_ONLY" -eq 1 ]; then
  : # مخطط auth يملكه Supabase، والهيكل وحده لا يحتاج حساباته
elif [ "$(pg_tool psql "$DB_URL" -tAc "select to_regclass('auth.users') is not null")" = "t" ]; then
  echo "→ حسابات الدخول (auth) …"
  pg_tool pg_dump "$DB_URL" --data-only --no-owner --table=auth.users --table=auth.identities | gzip -9 > "${BASE}_auth.sql.gz"
  gzip -t "${BASE}_auth.sql.gz"
  FILES+=("${BASE}_auth.sql.gz")
else
  echo "⚠ لا مخطط auth في هذه القاعدة — تُنسخ public وحدها."
fi

if [ "$SKIP_STORAGE" -eq 0 ]; then
  echo "→ التخزين …"
  npx tsx scripts/storage-backup.ts "${BASE}_storage"
  # أسماء نسبية داخل المجلد: tar يقرأ «C:» في مسار ويندوز مضيفًا بعيدًا
  (cd "$OUT_DIR" && tar -czf "backup-${TS}_storage.tar.gz" "backup-${TS}_storage")
  rm -rf "${BASE}_storage"
  FILES+=("${BASE}_storage.tar.gz")
fi

FINAL=()
for f in "${FILES[@]}"; do
  out="$(encrypt_if_configured "$f")" || { echo "✗ تعذّر تشفير $f — لم يُحذف الأصل. تحقّق من مفتاح $BACKUP_GPG_RECIPIENT." >&2; exit 1; }
  FINAL+=("$out")
done
(cd "$OUT_DIR" && sha256sum "${FINAL[@]##*/}") > "$BASE.sha256"

KEEP="${BACKUP_KEEP_DAYS:-30}"
find "$OUT_DIR" -maxdepth 1 -name 'backup-*' -mtime +"$KEEP" -print -delete | sed 's/^/  حُذفت نسخة قديمة: /'

echo "✓ النسخة: $BASE.* ($(du -ch "${FINAL[@]}" | tail -1 | cut -f1))"
[ -n "${BACKUP_GPG_RECIPIENT:-}" ] || echo "⚠ غير مشفّرة (بيئة غير الإنتاج). احفظها على قرص مشفّر أو احذفها بعد الفحص."
