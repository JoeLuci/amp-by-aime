#!/usr/bin/env bash
# Top-level wrapper: refresh staging data from prod (both Supabase + GHL).
#
# Required env vars (script will fail fast if any are missing):
#   PROD_DB_URL         Supabase pooler URL for prod
#   STAGING_DB_URL      Supabase pooler URL for staging
#   GHL_PROD_KEY        Private Integration Token for prod GHL sub-account
#   GHL_PROD_LOC        Prod location ID (cV1D3vLQCdcoLYS0rzU9)
#   GHL_STAGING_KEY     Private Integration Token for AIME Staging sub-account
#   GHL_STAGING_LOC     Staging location ID (PJAAN2zV4gJW33Sbm5Sr)
#
# Optional flags (forwarded to refresh-ghl.mjs):
#   --resume    Resume GHL refresh from last completed entity (state at /tmp/refresh-ghl-state.json)
#   --dry-run   Don't actually write to staging — just enumerate
#
# Order: Supabase first (faster, deterministic), then GHL (slow, network-bound).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

: "${PROD_DB_URL:?PROD_DB_URL required}"
: "${STAGING_DB_URL:?STAGING_DB_URL required}"
: "${GHL_PROD_KEY:?GHL_PROD_KEY required}"
: "${GHL_PROD_LOC:?GHL_PROD_LOC required}"
: "${GHL_STAGING_KEY:?GHL_STAGING_KEY required}"
: "${GHL_STAGING_LOC:?GHL_STAGING_LOC required}"

echo "================================================================"
echo "AMP staging data refresh — prod → staging"
echo "================================================================"
echo "Step 1/2: Supabase data refresh"
echo "----------------------------------------------------------------"
bash "$SCRIPT_DIR/refresh-supabase.sh"

echo ""
echo "================================================================"
echo "Step 2/2: GHL data refresh"
echo "----------------------------------------------------------------"
node "$SCRIPT_DIR/refresh-ghl.mjs" "$@"

echo ""
echo "================================================================"
echo "Done. Staging is now refreshed from prod."
echo "================================================================"
