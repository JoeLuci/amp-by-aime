#!/usr/bin/env bash
# Top-level wrapper: refresh staging data from prod (both Supabase + GHL).
#
# Required env vars (script will fail fast if any GHL var is missing).
# Supabase auth is read from SUPABASE_ACCESS_TOKEN or the macOS Keychain
# entry written by `supabase login` — no DB password needed.
#
#   GHL_PROD_KEY        Private Integration Token for prod GHL sub-account
#   GHL_PROD_LOC        Prod location ID (jkxvgEvFdjquLpd4fomf)
#   GHL_STAGING_KEY     Private Integration Token for AIME Staging sub-account
#   GHL_STAGING_LOC     Staging location ID (PJAAN2zV4gJW33Sbm5Sr)
#
# Optional flags (forwarded to both scripts):
#   --resume    GHL only: resume from last completed entity
#   --dry-run   Verify connectivity + sample; no TRUNCATE, no writes
#
# Order: Supabase first (deterministic, ~30 sec), then GHL (slow, network-bound).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

: "${GHL_PROD_KEY:?GHL_PROD_KEY required}"
: "${GHL_PROD_LOC:?GHL_PROD_LOC required}"
: "${GHL_STAGING_KEY:?GHL_STAGING_KEY required}"
: "${GHL_STAGING_LOC:?GHL_STAGING_LOC required}"

echo "================================================================"
echo "AMP staging data refresh — prod → staging"
echo "================================================================"
echo "Step 1/2: Supabase data refresh"
echo "----------------------------------------------------------------"
node "$SCRIPT_DIR/refresh-supabase.mjs" "$@"

echo ""
echo "================================================================"
echo "Step 2/2: GHL data refresh"
echo "----------------------------------------------------------------"
node "$SCRIPT_DIR/refresh-ghl.mjs" "$@"

echo ""
echo "================================================================"
echo "Done. Staging is now refreshed from prod."
echo "================================================================"
