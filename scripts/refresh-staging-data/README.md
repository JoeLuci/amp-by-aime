# Refresh staging data from prod

Re-runnable scripts that copy ALL data from prod (Supabase + GHL) into staging.
Schema and structure are NOT modified — they're already in place via AIME-4
(Supabase clone) and AIME-8 (GHL snapshot). This refreshes the row-level data
to a current snapshot of prod.

## Scope: data only

| System    | Schemas / entities refreshed                                         |
| --------- | -------------------------------------------------------------------- |
| Supabase  | All base tables in `public`, `auth`, `storage` schemas               |
| GHL       | Contacts, opportunities, notes, tasks, tag attachments, conversations + messages, calendar appointments, invoices, products, custom-object records. Plus best-effort listing of orders/transactions/subscriptions/coupons/form-submissions/survey-submissions/invoice-schedules/memberships/documents/media (these are listed but not recreated — see "Not refreshed" below). |

PII is **not** anonymized — staging mirrors prod exactly, intentionally,
so prod users can log into staging.

## Prerequisites

- `pg_dump` and `psql` (PostgreSQL client 14+) on `$PATH`
- `node` (v18+) on `$PATH`
- A Private Integration Token (PIT) on each GHL sub-account with the scopes
  listed in `refresh-ghl.mjs` (currently read+write on contacts, opportunities,
  conversations, calendars, payments, forms, surveys, invoices, courses,
  products, medias, objects; readonly on a few config entities)

## Required env vars

```
PROD_DB_URL          # Supabase pooler URL for prod  (postgresql://postgres.<ref>:<pw>@aws-1-<region>.pooler.supabase.com:5432/postgres)
STAGING_DB_URL       # Supabase pooler URL for staging
GHL_PROD_KEY         # PIT for prod GHL sub-account
GHL_PROD_LOC         # cV1D3vLQCdcoLYS0rzU9
GHL_STAGING_KEY      # PIT for AIME Staging sub-account
GHL_STAGING_LOC      # PJAAN2zV4gJW33Sbm5Sr
```

The Supabase URLs come from Supabase Dashboard → Project Settings → Database
→ Connection string → "Pooler" (session mode, port 5432).

## Usage

Refresh both Supabase and GHL:

```bash
PROD_DB_URL='postgresql://...' \
STAGING_DB_URL='postgresql://...' \
GHL_PROD_KEY=pit-xxx \
GHL_PROD_LOC=cV1D3vLQCdcoLYS0rzU9 \
GHL_STAGING_KEY=pit-yyy \
GHL_STAGING_LOC=PJAAN2zV4gJW33Sbm5Sr \
bash scripts/refresh-staging-data/refresh.sh
```

Just Supabase (skip GHL):

```bash
PROD_DB_URL='...' STAGING_DB_URL='...' \
bash scripts/refresh-staging-data/refresh-supabase.sh
```

Just GHL (skip Supabase):

```bash
GHL_PROD_KEY=... GHL_PROD_LOC=... GHL_STAGING_KEY=... GHL_STAGING_LOC=... \
node scripts/refresh-staging-data/refresh-ghl.mjs
```

GHL with resume (picks up from last completed entity):

```bash
node scripts/refresh-staging-data/refresh-ghl.mjs --resume
```

GHL dry-run (lists prod entities, doesn't write to staging):

```bash
node scripts/refresh-staging-data/refresh-ghl.mjs --dry-run
```

## How it works

### Supabase (`refresh-supabase.sh`)

1. `pg_dump --data-only` from prod, dumping `public`, `auth`, `storage` schemas
2. `TRUNCATE` every base table in those schemas on staging (CASCADE, with FK
   checks disabled via `session_replication_role = replica`)
3. `psql` loads the prod dump into staging

The dump file is written to `$TMPDIR` and deleted after success.

### GHL (`refresh-ghl.mjs`)

1. Wipes staging contacts (cascades clear most child entities in GHL)
2. For each entity type in dependency order:
   - List from prod, paginated
   - Recreate in staging with foreign-key IDs remapped
3. Maintains an in-memory `prod_id → staging_id` map per entity type, persisted
   to `/tmp/refresh-ghl-state.json` for resume capability

Order:
1. Contacts (everything else references these)
2. Opportunities
3. Notes (per-contact)
4. Tasks (per-contact)
5. Tag attachments (per-contact)
6. Conversations + messages
7. Calendar appointments
8. Read-only listing: orders, transactions, subscriptions, coupons
9. Form submissions, survey submissions (read-only)
10. Invoices (writable), invoice schedules (read-only)
11. Products (writable)
12. Memberships, documents, media (read-only)
13. Custom object records (writable)

### Rate limiting

GHL API limit is ~100 req / 10 sec. We sleep `120ms` between calls (~8 req/sec)
and retry on `429` using the `Retry-After` header. 5xx errors are retried with
exponential backoff (up to 3 attempts).

## Not refreshed (and why)

| Entity                    | Reason                                                                     |
| ------------------------- | -------------------------------------------------------------------------- |
| Stripe data               | Stripe is the source of truth; subscriptions are kept in sync via webhooks |
| Storage object files      | Files live in S3; only metadata in DB. Files don't migrate with `pg_dump`. After refresh, image/file references in the DB will point at S3 paths that don't exist in staging — broken thumbnails, no crashes |
| Edge Function code        | Deployed separately via `supabase functions deploy` (already done in AIME-4 remainder) |
| Edge Function secrets     | Set separately via `supabase secrets set` (already done) |
| GHL workflow definitions  | Already in staging via AIME-8 snapshot — definitions don't change with data |
| GHL custom field defs     | Same — definitions are config |
| GHL pipeline/stage defs   | Same |
| GHL form/survey defs      | Same |
| GHL calendars (the cals)  | Same |
| GHL orders/transactions/subscriptions | Payment records can't be cleanly recreated via API without real charges happening — listed for inspection only |
| GHL form/survey submissions | Submissions can't be POSTed back via API (forms-only writes are for form definitions, not submissions) |
| GHL documents             | Generated documents tied to specific transactions; can't be cleanly recreated |
| GHL media library         | Media uploads need binary file content, not just metadata |
| GHL memberships           | Course enrollments need real signup events to materialize |

## When to refresh

Manually, before testing scenarios that need realistic data:

- After major prod changes you want to test against
- Before a sprint demo
- Before stress-testing reports/dashboards

There is **no schedule**. Running this against prod adds load — a full refresh
is ~20-40 min and pulls thousands of API calls. Don't automate it without
discussing with the prod admin first.

## Safety guards

- `refresh-supabase.sh` **refuses to run** if `STAGING_DB_URL` contains the
  prod project ref, or if `PROD_DB_URL` contains the staging project ref.
- `refresh-ghl.mjs` **refuses to run** if `GHL_PROD_LOC === GHL_STAGING_LOC`.
- Both scripts read prod (no writes) and write only to staging.
