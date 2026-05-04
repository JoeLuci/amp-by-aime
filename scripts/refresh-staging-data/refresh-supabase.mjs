#!/usr/bin/env node
/**
 * Refresh staging Supabase data from prod via the Supabase Management API.
 *
 * Why Management API instead of pg_dump:
 *   pg_dump needs the raw Postgres password. Supabase only displays it once
 *   on creation; resetting it would invalidate any other connections.
 *   The Management API authenticates with a personal access token (sbp_*)
 *   already obtained via `supabase login`, so no password rotation is needed.
 *
 * What it does, table by table (schemas: public, auth, storage):
 *   1. SELECT all rows from prod via Management API SQL endpoint
 *   2. TRUNCATE the staging table (FK checks disabled in same transaction)
 *   3. INSERT rows into staging using jsonb_populate_recordset (preserves
 *      types: jsonb, timestamps, arrays, nulls)
 *
 * Idempotent: re-running converges staging to current prod state.
 *
 * Auth source priority:
 *   1. SUPABASE_ACCESS_TOKEN env var
 *   2. macOS Keychain entry written by `supabase login`
 *
 * Optional flags:
 *   --dry-run   Verify connectivity + sample row counts; no TRUNCATE, no INSERT.
 *
 * Project refs (these don't change):
 *   prod    = jrinrobepqsofuhjnxcp
 *   staging = nuuffnxjsjqdoubvrtcl
 */

import { spawnSync } from 'node:child_process';

const PROD_REF = 'jrinrobepqsofuhjnxcp';
const STAGING_REF = 'nuuffnxjsjqdoubvrtcl';
const SCHEMAS = ['public', 'auth', 'storage'];
const BATCH_ROWS = 50; // Conservative — Management API has request size limits; smaller batches handle wide rows safely
const DRY_RUN = process.argv.includes('--dry-run');

// Staging-specific overrides — run after the refresh to undo prod values that
// staging needs different. AIME-7 swapped live Stripe IDs to test IDs in
// `subscription_plans` and `allowed_stripe_prices`; refreshing from prod would
// otherwise put the live IDs back and break test-mode checkout.
const STAGING_OVERRIDES_SQL = `
BEGIN;

-- subscription_plans: live → test stripe IDs (12 rows)
UPDATE subscription_plans SET stripe_price_id = 'price_1TQwVWKq6gZ6OHL8f938nXP4', stripe_product_id = 'prod_UPm3304pI5RsoC' WHERE stripe_price_id = 'price_1PtZuiKq6gZ6OHL8dRdkjr8G';
UPDATE subscription_plans SET stripe_price_id = 'price_1TQwW4Kq6gZ6OHL83l8AiTyT', stripe_product_id = 'prod_UPm3304pI5RsoC' WHERE stripe_price_id = 'price_1PtZvAKq6gZ6OHL8AKsPuIYS';
UPDATE subscription_plans SET stripe_price_id = 'price_1TQwSZKq6gZ6OHL8jQmugOWY', stripe_product_id = 'prod_UPm0uR2XTZyQD5' WHERE stripe_price_id = 'price_1RhZVaKq6gZ6OHL8DcBogOUv';
UPDATE subscription_plans SET stripe_price_id = 'price_1TQwSoKq6gZ6OHL8tFt62mPQ', stripe_product_id = 'prod_UPm0uR2XTZyQD5' WHERE stripe_price_id = 'price_1RhZVyKq6gZ6OHL8e5GtRB3r';
UPDATE subscription_plans SET stripe_price_id = 'price_1TQwUUKq6gZ6OHL8tlEEfunE', stripe_product_id = 'prod_UPm2aOwTciYldj' WHERE stripe_price_id = 'price_1PtZmdKq6gZ6OHL8b8D2okBw';
UPDATE subscription_plans SET stripe_price_id = 'price_1TQwUsKq6gZ6OHL8B4FJeD95', stripe_product_id = 'prod_UPm2aOwTciYldj' WHERE stripe_price_id = 'price_1PtZoCKq6gZ6OHL8NhK2QLQA';
UPDATE subscription_plans SET stripe_price_id = 'price_1TQwTNKq6gZ6OHL85IISJrkU', stripe_product_id = 'prod_UPm15sNyELkzkM' WHERE stripe_price_id = 'price_1RhZUuKq6gZ6OHL8l77hU8fR';
UPDATE subscription_plans SET stripe_price_id = 'price_1TQwTkKq6gZ6OHL8bLmN8twV', stripe_product_id = 'prod_UPm15sNyELkzkM' WHERE stripe_price_id = 'price_1RhZUuKq6gZ6OHL8ZZtf3w8g';
UPDATE subscription_plans SET stripe_price_id = 'price_1TQwYAKq6gZ6OHL8R4xrppr4', stripe_product_id = 'prod_UPm4lFx6IoqoZc' WHERE stripe_price_id = 'price_1PtZw5Kq6gZ6OHL8SlbrZqOA';
UPDATE subscription_plans SET stripe_price_id = 'price_1TQwYAKq6gZ6OHL8gZNoBnOJ', stripe_product_id = 'prod_UPm4lFx6IoqoZc' WHERE stripe_price_id = 'price_1PtZwTKq6gZ6OHL8zRSVLHKi';
UPDATE subscription_plans SET stripe_price_id = 'price_1TQwROKq6gZ6OHL8QYX8vKET', stripe_product_id = 'prod_UPlxyVSyzgJ9wW' WHERE stripe_price_id = 'price_1RhZWaKq6gZ6OHL8kdecStbM';
UPDATE subscription_plans SET stripe_price_id = 'price_1TQwRWKq6gZ6OHL8S3mn3of6', stripe_product_id = 'prod_UPlxyVSyzgJ9wW' WHERE stripe_price_id = 'price_1RhZWtKq6gZ6OHL8C0YVDBR1';

-- allowed_stripe_prices: same 12 swaps
UPDATE allowed_stripe_prices SET stripe_price_id = 'price_1TQwVWKq6gZ6OHL8f938nXP4', stripe_product_id = 'prod_UPm3304pI5RsoC' WHERE stripe_price_id = 'price_1PtZuiKq6gZ6OHL8dRdkjr8G';
UPDATE allowed_stripe_prices SET stripe_price_id = 'price_1TQwW4Kq6gZ6OHL83l8AiTyT', stripe_product_id = 'prod_UPm3304pI5RsoC' WHERE stripe_price_id = 'price_1PtZvAKq6gZ6OHL8AKsPuIYS';
UPDATE allowed_stripe_prices SET stripe_price_id = 'price_1TQwSZKq6gZ6OHL8jQmugOWY', stripe_product_id = 'prod_UPm0uR2XTZyQD5' WHERE stripe_price_id = 'price_1RhZVaKq6gZ6OHL8DcBogOUv';
UPDATE allowed_stripe_prices SET stripe_price_id = 'price_1TQwSoKq6gZ6OHL8tFt62mPQ', stripe_product_id = 'prod_UPm0uR2XTZyQD5' WHERE stripe_price_id = 'price_1RhZVyKq6gZ6OHL8e5GtRB3r';
UPDATE allowed_stripe_prices SET stripe_price_id = 'price_1TQwUUKq6gZ6OHL8tlEEfunE', stripe_product_id = 'prod_UPm2aOwTciYldj' WHERE stripe_price_id = 'price_1PtZmdKq6gZ6OHL8b8D2okBw';
UPDATE allowed_stripe_prices SET stripe_price_id = 'price_1TQwUsKq6gZ6OHL8B4FJeD95', stripe_product_id = 'prod_UPm2aOwTciYldj' WHERE stripe_price_id = 'price_1PtZoCKq6gZ6OHL8NhK2QLQA';
UPDATE allowed_stripe_prices SET stripe_price_id = 'price_1TQwTNKq6gZ6OHL85IISJrkU', stripe_product_id = 'prod_UPm15sNyELkzkM' WHERE stripe_price_id = 'price_1RhZUuKq6gZ6OHL8l77hU8fR';
UPDATE allowed_stripe_prices SET stripe_price_id = 'price_1TQwTkKq6gZ6OHL8bLmN8twV', stripe_product_id = 'prod_UPm15sNyELkzkM' WHERE stripe_price_id = 'price_1RhZUuKq6gZ6OHL8ZZtf3w8g';
UPDATE allowed_stripe_prices SET stripe_price_id = 'price_1TQwYAKq6gZ6OHL8R4xrppr4', stripe_product_id = 'prod_UPm4lFx6IoqoZc' WHERE stripe_price_id = 'price_1PtZw5Kq6gZ6OHL8SlbrZqOA';
UPDATE allowed_stripe_prices SET stripe_price_id = 'price_1TQwYAKq6gZ6OHL8gZNoBnOJ', stripe_product_id = 'prod_UPm4lFx6IoqoZc' WHERE stripe_price_id = 'price_1PtZwTKq6gZ6OHL8zRSVLHKi';
UPDATE allowed_stripe_prices SET stripe_price_id = 'price_1TQwROKq6gZ6OHL8QYX8vKET', stripe_product_id = 'prod_UPlxyVSyzgJ9wW' WHERE stripe_price_id = 'price_1RhZWaKq6gZ6OHL8kdecStbM';
UPDATE allowed_stripe_prices SET stripe_price_id = 'price_1TQwRWKq6gZ6OHL8S3mn3of6', stripe_product_id = 'prod_UPlxyVSyzgJ9wW' WHERE stripe_price_id = 'price_1RhZWtKq6gZ6OHL8C0YVDBR1';

COMMIT;
`;

// ---------------------------------------------------------------------------
// Auth: personal access token from env, or macOS Keychain (supabase login)
// ---------------------------------------------------------------------------
function getAccessToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN;
  // spawnSync without a shell — args are explicit, nothing user-supplied.
  const r = spawnSync('security', [
    'find-generic-password', '-s', 'Supabase CLI', '-a', 'supabase', '-w',
  ], { stdio: ['ignore', 'pipe', 'ignore'] });
  if (r.status !== 0) {
    throw new Error('No Supabase access token found. Set SUPABASE_ACCESS_TOKEN or run `supabase login`.');
  }
  const raw = r.stdout.toString().trim();
  if (raw.startsWith('go-keyring-base64:')) {
    return Buffer.from(raw.slice('go-keyring-base64:'.length), 'base64').toString('utf8').trim();
  }
  return raw;
}

const TOKEN = getAccessToken();

// ---------------------------------------------------------------------------
// Management API SQL helper
// ---------------------------------------------------------------------------
async function mgmtSql(projectRef, query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Management API ${projectRef} (${res.status}): ${text.slice(0, 500)}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Schema introspection
// ---------------------------------------------------------------------------
async function listTables(projectRef) {
  const schemaList = SCHEMAS.map((s) => `'${s}'`).join(',');
  const rows = await mgmtSql(projectRef, `
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_schema IN (${schemaList})
      AND table_type = 'BASE TABLE'
    ORDER BY table_schema, table_name
  `);
  return rows.map((r) => ({ schema: r.table_schema, name: r.table_name }));
}

async function listGeneratedColumns(projectRef) {
  const schemaList = SCHEMAS.map((s) => `'${s}'`).join(',');
  const rows = await mgmtSql(projectRef, `
    SELECT table_schema, table_name, column_name
    FROM information_schema.columns
    WHERE table_schema IN (${schemaList})
      AND is_generated = 'ALWAYS'
  `);
  const map = new Map();
  for (const r of rows) {
    const key = `${r.table_schema}.${r.table_name}`;
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(r.column_name);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Identifier quoting + dollar-quote tag for inline JSON
// ---------------------------------------------------------------------------
const quoteIdent = (s) => `"${s.replace(/"/g, '""')}"`;
const fqn = (schema, name) => `${quoteIdent(schema)}.${quoteIdent(name)}`;

function pickTag(json) {
  for (let i = 0; i < 1000; i++) {
    const tag = `J${i.toString(36)}`;
    if (!json.includes(`$${tag}$`)) return tag;
  }
  // Surface enough info to act on if this ever happens — extremely unlikely
  // (would need real data containing all of $J0$..$Jrr$ patterns).
  throw new Error(`pickTag: all 1000 candidate dollar-quote tags found in row data (length=${json.length}). Reduce BATCH_ROWS or pre-encode rows.`);
}

// ---------------------------------------------------------------------------
// Per-table operations
// ---------------------------------------------------------------------------
async function dumpTable(table) {
  const rows = await mgmtSql(PROD_REF, `SELECT row_to_json(t.*) AS r FROM ${fqn(table.schema, table.name)} t`);
  return rows.map((r) => r.r);
}

async function loadTable(table, rows, generatedCols) {
  if (rows.length === 0) return { inserted: 0 };

  // Strip generated columns from each row.
  const cleanRows = generatedCols.size
    ? rows.map((r) => {
        const c = { ...r };
        for (const g of generatedCols) delete c[g];
        return c;
      })
    : rows;

  let inserted = 0;
  for (let i = 0; i < cleanRows.length; i += BATCH_ROWS) {
    const batch = cleanRows.slice(i, i + BATCH_ROWS);
    const json = JSON.stringify(batch);
    const tag = pickTag(json);
    const sql = `BEGIN;
      SET LOCAL session_replication_role = replica;
      INSERT INTO ${fqn(table.schema, table.name)}
        SELECT * FROM jsonb_populate_recordset(NULL::${fqn(table.schema, table.name)}, $${tag}$${json}$${tag}$::jsonb);
      COMMIT;`;
    await mgmtSql(STAGING_REF, sql);
    inserted += batch.length;
  }
  return { inserted };
}

async function truncateAllStaging(tables) {
  const list = tables.map((t) => fqn(t.schema, t.name)).join(', ');
  const sql = `BEGIN;
    SET LOCAL session_replication_role = replica;
    TRUNCATE TABLE ${list} CASCADE;
    COMMIT;`;
  await mgmtSql(STAGING_REF, sql);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('================================================================');
  console.log('Supabase data refresh (via Management API)');
  console.log(`  PROD:    ${PROD_REF}`);
  console.log(`  STAGING: ${STAGING_REF}`);
  console.log(`  schemas: ${SCHEMAS.join(', ')}`);
  console.log(`  DRY_RUN: ${DRY_RUN}`);
  console.log('================================================================');

  console.log('\n[1/5] Listing prod tables...');
  const prodTables = await listTables(PROD_REF);
  console.log(`  ${prodTables.length} tables across ${SCHEMAS.length} schemas`);

  console.log('\n[2/5] Listing staging tables (must match)...');
  const stagingTables = await listTables(STAGING_REF);
  console.log(`  ${stagingTables.length} tables`);

  const prodSet = new Set(prodTables.map((t) => `${t.schema}.${t.name}`));
  const stagingSet = new Set(stagingTables.map((t) => `${t.schema}.${t.name}`));
  const onlyProd = [...prodSet].filter((k) => !stagingSet.has(k));
  const onlyStaging = [...stagingSet].filter((k) => !prodSet.has(k));
  if (onlyProd.length || onlyStaging.length) {
    console.log(`  schema drift: only-in-prod=${onlyProd.length}, only-in-staging=${onlyStaging.length}`);
    if (onlyProd.length) console.log(`    only in prod: ${onlyProd.join(', ')}`);
    if (onlyStaging.length) console.log(`    only in staging: ${onlyStaging.join(', ')}`);
  }
  const tables = prodTables.filter((t) => stagingSet.has(`${t.schema}.${t.name}`));
  console.log(`  ${tables.length} tables to refresh`);

  console.log('\n[3/5] Listing generated columns (skipped on insert)...');
  const generatedColsByTable = await listGeneratedColumns(STAGING_REF);
  let totalGenerated = 0;
  for (const set of generatedColsByTable.values()) totalGenerated += set.size;
  console.log(`  ${totalGenerated} generated columns across ${generatedColsByTable.size} tables`);

  if (DRY_RUN) {
    console.log('\n[4/5] DRY-RUN — sampling row counts on a subset of tables...');
    const sample = ['public.profiles', 'auth.users', 'public.subscription_plans', 'public.loan_escalations', 'storage.objects'];
    for (const k of sample) {
      const [schema, name] = k.split('.');
      if (!prodSet.has(k)) { console.log(`  ${k}: missing on prod`); continue; }
      const prodCount = (await mgmtSql(PROD_REF, `SELECT COUNT(*)::bigint AS n FROM ${fqn(schema, name)}`))[0].n;
      const stagingCount = (await mgmtSql(STAGING_REF, `SELECT COUNT(*)::bigint AS n FROM ${fqn(schema, name)}`))[0].n;
      console.log(`  ${k}: prod=${prodCount}, staging=${stagingCount}`);
    }
    console.log('\n[5/5] DRY-RUN done. A real run would TRUNCATE + reload all tables above.');
    return;
  }

  console.log('\n[4/5] TRUNCATE all staging tables (FK disabled, single transaction)...');
  await truncateAllStaging(tables);
  console.log('  done.');

  console.log('\n[5/5] Dumping prod + loading staging, table-by-table...');
  let totalRows = 0;
  const errors = [];
  const t0 = Date.now();
  for (const t of tables) {
    const fkey = `${t.schema}.${t.name}`;
    try {
      const rows = await dumpTable(t);
      const generatedCols = generatedColsByTable.get(fkey) ?? new Set();
      const { inserted } = await loadTable(t, rows, generatedCols);
      totalRows += inserted;
      console.log(`  ${fkey}: ${inserted} rows`);
    } catch (err) {
      errors.push({ table: fkey, error: err.message });
      console.error(`  ${fkey}: ERROR — ${err.message}`);
    }
  }
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  console.log('\n[6/6] Applying staging-specific overrides (Stripe live → test IDs)...');
  await mgmtSql(STAGING_REF, STAGING_OVERRIDES_SQL);
  console.log('  done — subscription_plans + allowed_stripe_prices rolled back to test IDs.');

  console.log('\n================================================================');
  console.log(`Done. ${totalRows} rows loaded across ${tables.length - errors.length} tables in ${elapsed}s.`);
  if (errors.length) {
    console.log(`${errors.length} tables failed:`);
    for (const e of errors) console.log(`  ${e.table}: ${e.error}`);
    process.exit(1);
  }
  console.log('================================================================');
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
