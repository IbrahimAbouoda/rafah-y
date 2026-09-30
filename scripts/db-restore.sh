#!/usr/bin/env bash
# استعادة نسخة احتياطية — Sprint 6 · Q14. الإجراء الكامل في docs/ops/backup-and-restore.md.
#
#   scripts/db-restore.sh <backup-….sql.gz[.gpg]>                    استعادة تجريبية (الافتراضي)
#   RESTORE_CONFIRM="استعد النسخة" \
#   scripts/db-restore.sh <backup-….sql.gz[.gpg]> --apply --target <url>   استعادة فعلية إلى قاعدة فارغة
#
# التجريبية لا تلمس أي قاعدة قائمة: تنشئ قاعدة مؤقتة restore_check_* على خادم DIRECT_URL، تستعيد فيها،
# تتحقق (الجداول، الـ migrations، RLS، مشغّل التدقيق، الأعداد)، ثم تحذفها. وتفحص ملفي auth والتخزين وبصماتهما.
# الفعلية ترفض أي هدف فيه جداول في public: الاستعادة فوق بيانات قائمة لا تكون بسكربت.
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=scripts/lib/pg-tools.sh
. scripts/lib/pg-tools.sh

FILE="${1:-}"
MODE=dry-run
TARGET=""
shift || true
while [ $# -gt 0 ]; do
  case "$1" in
    --apply) MODE=apply ;;
    --target) TARGET="${2:-}"; shift ;;
    *) echo "✗ خيار غير معروف: $1" >&2; exit 2 ;;
  esac
  shift
done
[ -f "$FILE" ] || { echo "الاستخدام: scripts/db-restore.sh <backup-….sql.gz[.gpg]> [--apply --target <url>]" >&2; exit 2; }

DIR="$(cd "$(dirname "$FILE")" && pwd)"
NAME="$(basename "$FILE")"
BASE="${NAME%.gpg}"
BASE="${BASE%.sql.gz}"
WORK="$(mktemp -d)"
SCRATCH=""
cleanup() {
  [ -n "$SCRATCH" ] && pg_tool psql "$DB_URL" -qX -c "DROP DATABASE IF EXISTS \"$SCRATCH\" WITH (FORCE)" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

# 1) البصمات: الملف لم يتغيّر منذ النسخ
if [ -f "$DIR/$BASE.sha256" ]; then
  (cd "$DIR" && sha256sum --check --quiet --ignore-missing "$BASE.sha256") || { echo "✗ البصمات لا تطابق — النسخة تالفة أو عُدِّلت." >&2; exit 1; }
  echo "✓ البصمات مطابقة"
else
  echo "⚠ لا ملف بصمات $BASE.sha256 — تُكمَل الاستعادة بلا تحقق منها."
fi

# 2) فكّ التشفير عند الحاجة، ثم سلامة gzip
plain() { # plain <file> → مسار نسخة غير مشفّرة
  local f="$1"
  case "$f" in
    *.gpg) gpg --batch --quiet --decrypt --output "$WORK/$(basename "${f%.gpg}")" "$f"; printf '%s' "$WORK/$(basename "${f%.gpg}")" ;;
    *) printf '%s' "$f" ;;
  esac
}
DB_FILE="$(plain "$DIR/$NAME")"
gzip -t "$DB_FILE"
AUTH_FILE=""
for f in "$DIR/${BASE}_auth.sql.gz.gpg" "$DIR/${BASE}_auth.sql.gz"; do [ -f "$f" ] && { AUTH_FILE="$(plain "$f")"; break; }; done
STORAGE_FILE=""
for f in "$DIR/${BASE}_storage.tar.gz.gpg" "$DIR/${BASE}_storage.tar.gz"; do [ -f "$f" ] && { STORAGE_FILE="$(plain "$f")"; break; }; done

expected_tables=$(gzip -dc "$DB_FILE" | grep -c '^CREATE TABLE' || true)
repo_migrations=$(find prisma/migrations -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')

verify() { # verify <url> — يطبع النتائج ويعيد 1 عند أي خلل
  local url="$1" ok=0
  local q
  q=$(pg_tool psql "$url" -tAX -F'|' -c "
    select
      (select count(*) from pg_tables where schemaname = 'public'),
      (select count(*) from pg_tables where schemaname = 'public' and not rowsecurity),
      (select count(*) from public._prisma_migrations where finished_at is not null),
      (select count(*) from pg_trigger where tgname in ('audit_logs_append_only', 'audit_logs_no_truncate')),
      (select count(*) from public.users),
      (select count(*) from public.complaints),
      (select count(*) from public.audit_logs)")
  IFS='|' read -r tables no_rls migrations triggers users complaints audits <<<"$q"
  echo "  الجداول: $tables (في النسخة $expected_tables) · بلا RLS: $no_rls · migrations: $migrations (في المستودع $repo_migrations) · مشغّلا التدقيق: $triggers/2"
  echo "  المستخدمون: $users · الشكاوى: $complaints · أسطر التدقيق: $audits"
  [ "$tables" = "$expected_tables" ] || { echo "✗ عدد الجداول لا يطابق النسخة" >&2; ok=1; }
  [ "$no_rls" = 0 ] || { echo "✗ جداول بلا RLS" >&2; ok=1; }
  [ "$triggers" = 2 ] || { echo "✗ مشغّل حماية التدقيق مفقود" >&2; ok=1; }
  [ "$migrations" = "$repo_migrations" ] || echo "⚠ النسخة على $migrations migration والمستودع على $repo_migrations — شغّل npx prisma migrate deploy بعد الاستعادة الفعلية."
  return $ok
}

restore_public() { # restore_public <url>
  pg_tool psql "$1" -qX -v ON_ERROR_STOP=1 -c 'DROP SCHEMA IF EXISTS public CASCADE' >/dev/null
  gzip -dc "$DB_FILE" | pg_tool psql "$1" -qX -v ON_ERROR_STOP=1 >/dev/null
}

check_side_files() {
  if [ -n "$AUTH_FILE" ]; then
    gzip -t "$AUTH_FILE"
    echo "✓ ملف auth سليم ($(gzip -dc "$AUTH_FILE" | awk '/^COPY auth\.users/{c=1;next} /^\\\./{c=0} c' | wc -l | tr -d ' ') حسابًا)"
  else
    echo "⚠ لا ملف auth بجانب النسخة — الحسابات لا تُستعاد معها."
  fi
  if [ -n "$STORAGE_FILE" ]; then
    tar -xzf "$STORAGE_FILE" -C "$WORK"
    local sd="$WORK/${BASE}_storage"
    node -e '
      const fs=require("fs"),path=require("path"),crypto=require("crypto");const dir=process.argv[1];
      const m=JSON.parse(fs.readFileSync(path.join(dir,"manifest.json"),"utf8"));let bad=0;
      for(const o of m.objects){const b=fs.readFileSync(path.join(dir,"objects",o.path));if(crypto.createHash("sha256").update(b).digest("hex")!==o.sha256||b.length!==o.size){bad++;console.error("✗ بصمة لا تطابق: "+o.path)}}
      console.log((bad?"✗":"✓")+" التخزين: "+m.objects.length+" كائنًا في الأرشيف، "+bad+" تالفًا");process.exit(bad?1:0)' "$sd"
  else
    echo "⚠ لا أرشيف تخزين بجانب النسخة."
  fi
}

load_db_url

if [ "$MODE" = dry-run ]; then
  SCRATCH="restore_check_$(date -u +%Y%m%d%H%M%S)"
  echo "→ استعادة تجريبية في قاعدة مؤقتة $SCRATCH …"
  pg_tool psql "$DB_URL" -qX -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$SCRATCH\"" >/dev/null
  SCRATCH_URL="$(printf '%s' "$DB_URL" | sed -E "s#/([^/?]+)(\?.*)?\$#/$SCRATCH\2#")"
  restore_public "$SCRATCH_URL"
  verify "$SCRATCH_URL"
  check_side_files
  echo "✓ الاستعادة التجريبية نجحت؛ القاعدة المؤقتة تُحذف الآن."
  exit 0
fi

# ─── الاستعادة الفعلية ───
[ -n "$TARGET" ] || { echo "✗ --apply يحتاج --target <url> صريحًا — لا استعادة إلى DIRECT_URL ضمنًا." >&2; exit 2; }
[ "${RESTORE_CONFIRM:-}" = "استعد النسخة" ] || { echo "✗ للتأكيد: RESTORE_CONFIRM=\"استعد النسخة\"" >&2; exit 2; }
existing=$(pg_tool psql "$TARGET" -tAX -c "select count(*) from pg_tables where schemaname = 'public'")
[ "$existing" = 0 ] || { echo "✗ الهدف فيه $existing جدولًا في public. الاستعادة الفعلية إلى مشروع فارغ فقط (انظر التوثيق)." >&2; exit 1; }

echo "→ استعادة public إلى الهدف …"
restore_public "$TARGET"
echo "→ إغلاق Data API من جديد (المشروع الجديد يمنح anon/authenticated افتراضيًا) …"
pg_tool psql "$TARGET" -qX -v ON_ERROR_STOP=1 < prisma/migrations/20260927120000_lock_down_data_api/migration.sql >/dev/null
if [ -n "$AUTH_FILE" ]; then
  echo "→ حسابات الدخول …"
  gzip -dc "$AUTH_FILE" | pg_tool psql "$TARGET" -qX -v ON_ERROR_STOP=1 >/dev/null
fi
verify "$TARGET"
grants=$(pg_tool psql "$TARGET" -tAX -c "select count(*) from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'authenticated')")
[ "$grants" = 0 ] || { echo "✗ ما زال لـ anon/authenticated $grants صلاحية على public" >&2; exit 1; }
check_side_files
if [ -n "$STORAGE_FILE" ]; then
  echo "→ لإعادة المرفقات: NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npx tsx scripts/storage-restore.ts <مجلد مستخرج من ${BASE}_storage.tar.gz>"
fi
echo "✓ استُعيدت القاعدة. أكمل خطوات «بعد الاستعادة» في docs/ops/backup-and-restore.md."
