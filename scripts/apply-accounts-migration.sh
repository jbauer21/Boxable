#!/usr/bin/env bash
# Apply the Boxable accounts migration to hosted Supabase.
# Requires the project database password from Dashboard → Project Settings → Database.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REF="${SUPABASE_PROJECT_REF:-dlnyuqnwmojzleejussf}"
MIGRATION="$ROOT/supabase/migrations/202609140001_accounts.sql"
if [[ ! -f "$MIGRATION" ]]; then
  echo "Missing migration: $MIGRATION" >&2
  exit 1
fi
if [[ -z "${SUPABASE_DB_PASSWORD:-}" || -z "${SUPABASE_DB_HOST:-}" || -z "${SUPABASE_DB_USER:-}" ]]; then
  echo "Set SUPABASE_DB_HOST and SUPABASE_DB_USER from the project's Connect dialog." >&2
  echo "Set SUPABASE_DB_PASSWORD securely in your environment, then run:" >&2
  echo "  bash scripts/apply-accounts-migration.sh" >&2
  echo "Or paste $MIGRATION into the Supabase SQL Editor and run it once." >&2
  exit 1
fi
if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required (install PostgreSQL client tools)." >&2
  exit 1
fi
# Use the project's actual direct/session host; never guess its pooler region.
# Keep passwords out of the connection URI and command-line arguments.
echo "Applying $(basename "$MIGRATION") to project ${REF}…"
PGPASSWORD="$SUPABASE_DB_PASSWORD" PGSSLMODE=require psql \
  --host="$SUPABASE_DB_HOST" --username="$SUPABASE_DB_USER" \
  --port="${SUPABASE_DB_PORT:-5432}" --dbname=postgres \
  -v ON_ERROR_STOP=1 -f "$MIGRATION"
echo "Migration applied. Verify with: select count(*) from public.drawers;"
