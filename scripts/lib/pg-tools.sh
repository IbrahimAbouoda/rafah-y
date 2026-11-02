#!/usr/bin/env bash
# أدوات Postgres المشتركة لسكربتات النسخ والاستعادة (docs/ops/backup-and-restore.md).
# pg_dump و psql من PATH إن وُجدا بإصدار ≥ خادم Supabase (17)، وإلا من حاوية postgres:17 عبر Docker.

PG_MAJOR="${PG_MAJOR:-17}"

pg_native_ok() {
  command -v "$1" >/dev/null 2>&1 || return 1
  local v
  v=$("$1" --version | grep -oE '[0-9]+' | head -1)
  [ "${v:-0}" -ge "$PG_MAJOR" ]
}

# داخل الحاوية، localhost هو الحاوية نفسها: نعيد توجيهه إلى المضيف
docker_url() { printf '%s' "$1" | sed -E 's#@(localhost|127\.0\.0\.1)([:/])#@host.docker.internal\2#'; }

# pg_tool <pg_dump|psql> <url> [args…] — stdin و stdout يمرّان كما هما
pg_tool() {
  local tool="$1" url="$2"
  shift 2
  if pg_native_ok "$tool"; then
    "$tool" "$url" "$@"
  else
    command -v docker >/dev/null 2>&1 || { echo "✗ لا $tool بإصدار ≥ $PG_MAJOR ولا Docker. ثبّت postgresql-client-$PG_MAJOR." >&2; return 127; }
    MSYS_NO_PATHCONV=1 docker run --rm -i --add-host=host.docker.internal:host-gateway "postgres:$PG_MAJOR-alpine" \
      "$tool" "$(docker_url "$url")" "$@"
  fi
}

# رابط القاعدة من المتغيّرات أو ملفات .env (DIRECT_URL أولًا: pg_dump يحتاج اتصالًا مباشرًا لا pooler)
load_db_url() {
  if [ -z "${DIRECT_URL:-}${DATABASE_URL:-}" ]; then
    for f in .env.production.local .env.local .env; do
      [ -f "$f" ] || continue
      set -a
      # shellcheck disable=SC1090
      . "$f"
      set +a
    done
  fi
  DB_URL="${DIRECT_URL:-${DATABASE_URL:-}}"
  [ -n "$DB_URL" ] || { echo "✗ عيّن DIRECT_URL (أو DATABASE_URL)." >&2; return 1; }
  DB_URL="${DB_URL%\"}"
  DB_URL="${DB_URL#\"}"
}

is_production() { [ "${APP_ENV:-}" = production ] || [ "${VERCEL_ENV:-}" = production ]; }

# تشفير بمفتاح عام: من يملك الملف لا يقرؤه بلا المفتاح الخاص (يُحفظ خارج الخادم — انظر التوثيق)
encrypt_if_configured() {
  local file="$1"
  if [ -n "${BACKUP_GPG_RECIPIENT:-}" ]; then
    # الأصل لا يُحذف إلا بعد وجود نسخة مشفّرة غير فارغة: set -e لا يعمل داخل $(…)، فالفحص صريح
    gpg --batch --yes --trust-model always --encrypt --recipient "$BACKUP_GPG_RECIPIENT" --output "$file.gpg" "$file" >&2 || return 1
    [ -s "$file.gpg" ] || return 1
    rm -f "$file"
    printf '%s' "$file.gpg"
  else
    printf '%s' "$file"
  fi
}
