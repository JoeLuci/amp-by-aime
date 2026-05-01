# Refresh staging data from prod

Re-runnable scripts that copy ALL data from prod into staging — for both
Supabase and the GHL sub-account. Schema and structure are NOT modified;
they're already in place via AIME-4 (Supabase clone) and AIME-8 (GHL
snapshot). This refreshes row-level data to a current snapshot of prod.

## Scope: data only

| System    | What gets refreshed                                                  |
| --------- | -------------------------------------------------------------------- |
| Supabase  | All base tables in `public`, `auth`, `storage` schemas (~70 tables) |
| GHL       | Contacts, opportunities, notes, tasks, tag attachments, followers, conversations + messages, calendar appointments, coupons, invoices, invoice schedules, products, custom-object records. Plus read-only listing of orders, transactions, subscriptions, form submissions, survey submissions, documents, memberships (these don't have create endpoints in the public API and can't be migrated). |

PII is **not** anonymized — staging mirrors prod exactly, intentionally,
so prod users can log into staging.

## Prerequisites

- `node` v18+ on `$PATH`
- For Supabase: a Supabase personal access token (`sbp_*`). The script reads
  it from `SUPABASE_ACCESS_TOKEN` env var or from the macOS Keychain entry
  written by `supabase login`. No raw Postgres password needed.
- For GHL: Private Integration Tokens (PITs) on each sub-account with the
  scopes listed at the top of `refresh-ghl.mjs`.

## Required env vars

```
GHL_PROD_KEY      # PIT for prod GHL sub-account
GHL_PROD_LOC      # jkxvgEvFdjquLpd4fomf
GHL_STAGING_KEY   # PIT for AIME Staging sub-account
GHL_STAGING_LOC   # PJAAN2zV4gJW33Sbm5Sr
```

Optional:

```
SUPABASE_ACCESS_TOKEN   # if you don't want the script to read the keychain
```

## Required GHL PIT scopes (both prod and staging tokens)

Read access only would be enough on prod, but full read+write on both is
simpler. Create the PIT in the GHL agency dashboard with these scopes:

```
contacts.readonly contacts.write
opportunities.readonly opportunities.write
conversations.readonly conversations.write
conversations/message.readonly conversations/message.write
calendars.readonly calendars.write
calendars/events.readonly calendars/events.write
payments/orders.readonly payments/orders.write
payments/transactions.readonly        # read-only — no write scope exists
payments/subscriptions.readonly       # read-only — no write scope exists
payments/coupons.readonly payments/coupons.write
forms.readonly                        # read-only — submissions can't be POSTed back
surveys.readonly                      # read-only — same as forms
invoices.readonly invoices.write
invoices/schedule.readonly invoices/schedule.write
products.readonly products.write
medias.readonly medias.write
objects.readonly objects.write
locations/customFields.readonly
locations/customValues.readonly
locations/tags.readonly
workflows.readonly
```

## Usage

Refresh both Supabase + GHL:

```bash
GHL_PROD_KEY=pit-xxx \
GHL_PROD_LOC=jkxvgEvFdjquLpd4fomf \
GHL_STAGING_KEY=pit-yyy \
GHL_STAGING_LOC=PJAAN2zV4gJW33Sbm5Sr \
bash scripts/refresh-staging-data/refresh.sh
```

Just Supabase (skip GHL):

```bash
node scripts/refresh-staging-data/refresh-supabase.mjs
```

Just GHL (skip Supabase):

```bash
GHL_PROD_KEY=... GHL_PROD_LOC=... GHL_STAGING_KEY=... GHL_STAGING_LOC=... \
node scripts/refresh-staging-data/refresh-ghl.mjs
```

Dry-run (verifies connectivity + samples first page; no writes):

```bash
bash scripts/refresh-staging-data/refresh.sh --dry-run
```

GHL with resume (picks up from last completed entity):

```bash
node scripts/refresh-staging-data/refresh-ghl.mjs --resume
```

## How it works

### Supabase (`refresh-supabase.mjs`)

Uses the Supabase **Management API** (`POST /v1/projects/{ref}/database/query`)
authenticated with a personal access token. No raw Postgres password needed.

Per table:
1. `SELECT row_to_json(t.*) FROM <table> t` from prod
2. `TRUNCATE` all staging tables once (FK disabled in transaction via `session_replication_role = replica`)
3. Insert rows in batches of 500 via `jsonb_populate_recordset` (preserves jsonb, timestamps, arrays, nulls; safe dollar-quoting prevents SQL injection on the JSON payload)
4. Generated columns are introspected via `information_schema.columns is_generated = 'ALWAYS'` and stripped from each row before insert

### GHL (`refresh-ghl.mjs`)

Per the official GHL API v2 OpenAPI specs. Each entity uses its documented
endpoint + pagination pattern:

| Entity                    | Endpoint                                | Pagination                        |
| ------------------------- | --------------------------------------- | --------------------------------- |
| Contacts                  | `POST /contacts/search`                 | cursor (`searchAfter` per item)   |
| Opportunities             | `GET /opportunities/search`             | cursor (`startAfter`+`startAfterId`) |
| Notes / Tasks per-contact | `GET/POST /contacts/{id}/notes`+`/tasks`| none (all returned)               |
| Tag/follower attachments  | `POST /contacts/{id}/tags`+`/followers` | none (per-contact array)          |
| Conversations             | `GET /conversations/search`             | cursor (`startAfterDate`)         |
| Messages                  | `GET /conversations/{id}/messages`      | cursor (`lastMessageId`)          |
| Calendar events           | `GET /calendars/events`                 | none (time-window query)          |
| Coupons                   | `GET /payments/coupon/list`             | offset (`limit`+`offset`)         |
| Invoices + Schedules      | `GET /invoices/`+`/invoices/schedule/`  | offset                            |
| Products                  | `GET /products/`                        | offset                            |
| Custom object records     | `POST /objects/{key}/records/search`    | page+cursor hybrid                |
| Read-only listings        | various                                 | offset / page                     |

Order matters: contacts run first because everything else references
`contactId`. The script maintains an in-memory `prod_id → staging_id` map
per entity type, persisted to `/tmp/refresh-ghl-state.json` for resume.

Each entity is wrapped in a `safe()` block — a missing scope or transient
error logs and continues to the next entity rather than killing the run.

### Rate limiting

GHL limit is 100 req / 10 sec. Script sleeps 120ms between calls (~8 req/sec).
On 429, honors the `Retry-After` header. On 5xx, retries with exponential
backoff (3 attempts).

## Not refreshed (and why)

| Entity                              | Reason                                                                 |
| ----------------------------------- | ---------------------------------------------------------------------- |
| Stripe data                         | Stripe is the source of truth; subs sync via webhooks                  |
| Storage object files (Supabase)     | Files in S3 don't migrate; metadata copies (broken thumbnails OK)      |
| Edge Function code                  | Deployed separately via `supabase functions deploy` (AIME-4 remainder) |
| Edge Function secrets               | Set separately via `supabase secrets set` (already done)               |
| GHL workflow / pipeline / form / survey / custom field DEFINITIONS | Already in staging via AIME-8 snapshot — these are config |
| GHL transactions / subscriptions    | No write scope exists in the GHL API (read-only); listed only          |
| GHL form / survey submissions       | Auto-generated by end users; no API to POST submissions back           |
| GHL documents (proposals)           | No create endpoint — generated by templates                            |
| GHL memberships / course enrollments | Public API only has `POST /courses/courses-exporter/public/import`; no list endpoint |

## When to refresh

Manually, before testing scenarios that need realistic data. There is no
schedule. Running this against prod adds load (Supabase + GHL API calls);
discuss with the prod admin before automating.

Estimated time:
- Supabase: ~30-90 sec
- GHL: ~2-4 hours for full sync (29k contacts × 120ms is ~60 min just for contacts; nested resources add more)

## Safety guards

- `refresh-supabase.mjs` introspects schema on both projects and refreshes
  only tables that exist on BOTH (so adding a new table to prod doesn't
  blow up before staging migrations catch up).
- `refresh-ghl.mjs` refuses to run if `GHL_PROD_LOC === GHL_STAGING_LOC`.
- Both scripts read prod (no writes) and write only to staging.
