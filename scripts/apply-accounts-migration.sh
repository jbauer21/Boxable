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
if [[ -z "${SUPABASE_DB_PASSWORD:-}" ]]; then
  echo "Set SUPABASE_DB_PASSWORD to the database password, then re-run:" >&2
  echo "  SUPABASE_DB_PASSWORD='…' sh scripts/apply-accounts-migration.sh" >&2
  echo "Or paste $MIGRATION into the Supabase SQL Editor and run it once." >&2
  exit 1
fi
if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required (install PostgreSQL client tools)." >&2
  exit 1
fi
# Session mode URI used by Supabase for DDL-friendly connections.
URI="postgresql://postgres.${REF}:${SUPABASE_DB_PASSWORD}@aws-0-us-east-1.pooler.supabase.com:5432/postgres"
echo "Applying $(basename "$MIGRATION") to project ${REF}…"
psql "$URI" -v ON_ERROR_STOP=1 -f "$MIGRATION"
echo "Migration applied. Verify with: select count(*) from public.drawers;"
