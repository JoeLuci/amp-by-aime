#!/usr/bin/env bash
# Refresh staging Supabase data from prod.
#
# What it does:
#   1. pg_dump --data-only from prod (schemas: public, auth, storage)
#   2. TRUNCATE every base table in those schemas on staging
#   3. Load the prod dump into staging
#
# Idempotent: re-running converges staging to current prod state.
#
# Required env vars:
#   PROD_DB_URL     — Supabase pooler URL for prod
#   STAGING_DB_URL  — Supabase pooler URL for staging
#
# Connection string format (Supabase pooler, session mode, port 5432):
#   postgresql://postgres.<project_ref>:<password>@aws-1-<region>.pooler.supabase.com:5432/postgres
#
# Project refs:
#   prod    = jrinrobepqsofuhjnxcp
#   staging = nuuffnxjsjqdoubvrtcl
#
# Required local tooling: pg_dump + psql (PostgreSQL client 14+).
#
# Usage:
#   PROD_DB_URL='postgresql://...' STAGING_DB_URL='postgresql://...' bash refresh-supabase.sh

set -euo pipefail

: "${PROD_DB_URL:?PROD_DB_URL required (Supabase pooler URL for prod)}"
: "${STAGING_DB_URL:?STAGING_DB_URL required (Supabase pooler URL for staging)}"

# Sanity: never run this against the wrong project. Refuse if STAGING_DB_URL
# refers to the prod project ref, or PROD_DB_URL refers to the staging ref.
if [[ "$STAGING_DB_URL" == *"jrinrobepqsofuhjnxcp"* ]]; then
  echo "ERROR: STAGING_DB_URL contains prod project ref (jrinrobepqsofuhjnxcp). Aborting." >&2
  exit 1
fi
if [[ "$PROD_DB_URL" == *"nuuffnxjsjqdoubvrtcl"* ]]; then
  echo "ERROR: PROD_DB_URL contains staging project ref (nuuffnxjsjqdoubvrtcl). Aborting." >&2
  exit 1
fi

DUMP_FILE="${TMPDIR:-/tmp}/amp-prod-data-$(date +%Y%m%d-%H%M%S).sql"
TIMESTAMP_START=$(date +%s)

echo ">>> [1/3] Dumping data from prod (schemas: public, auth, storage)..."
pg_dump \
  --data-only \
  --no-owner \
  --no-privileges \
  --disable-triggers \
  --schema=public \
  --schema=auth \
  --schema=storage \
  -d "$PROD_DB_URL" \
  -f "$DUMP_FILE"

DUMP_SIZE=$(du -h "$DUMP_FILE" | cut -f1)
echo "    Wrote $DUMP_SIZE to $DUMP_FILE"

echo ">>> [2/3] Truncating staging public/auth/storage tables..."
psql -d "$STAGING_DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  r RECORD;
BEGIN
  -- Disable triggers + FK checks during truncate so we can clear in any order
  SET session_replication_role = replica;

  FOR r IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname IN ('public', 'auth', 'storage')
    ORDER BY schemaname, tablename
  LOOP
    EXECUTE format('TRUNCATE TABLE %I.%I CASCADE', r.schemaname, r.tablename);
  END LOOP;

  SET session_replication_role = origin;
END $$;
SQL

echo ">>> [3/3] Loading prod dump into staging..."
psql -d "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f "$DUMP_FILE"

echo ">>> Cleaning up dump file..."
rm -f "$DUMP_FILE"

ELAPSED=$(($(date +%s) - TIMESTAMP_START))
echo ">>> Done. Elapsed: ${ELAPSED}s."
