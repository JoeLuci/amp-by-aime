# Staging Supabase — Rollback Plan

**Project:** `amp-staging` (ref `nuuffnxjsjqdoubvrtcl`)
**Source of truth:** prod `amp` (ref `jrinrobepqsofuhjnxcp`)
**Approach:** the staging project is built by cloning prod via Supabase's "Restore to a new project" flow. Staging carries no original state we can't reproduce — if it's broken, we delete it and re-clone.

## Isolation guarantees — why deleting staging is safe

Deleting the staging Supabase project has **zero impact** on prod. The two projects are fully isolated:

| Layer | Isolation |
|---|---|
| **Database** | Separate Postgres instances on separate hosts. The staging project ref (`nuuffnxjsjqdoubvrtcl`) and prod ref (`jrinrobepqsofuhjnxcp`) resolve to different `db.<ref>.supabase.co` hostnames. No shared schema, no foreign keys across projects, no replication between them. |
| **Auth** | Each project has its own JWT signing secret. A token issued by staging cannot authenticate against prod (or vice versa) — the `ref` claim in the JWT is verified server-side. Even though we cloned `auth.users` so prod users can log into staging, the **session tokens** are project-specific. |
| **API endpoints** | Distinct Project URLs (`https://<ref>.supabase.co`). Staging clients hit staging endpoints; nothing in staging code or config references prod's URL. |
| **Edge Functions** | Deployed per-project. Staging will deploy its own copies — staging `expire-overrides` is a different runtime instance from prod's. Their secrets are also per-project. |
| **Outbound writes (cron + GHL trigger)** | After AIME-4 fixes (this commit), the 3 cron jobs and `sync_profile_to_ghl_trigger` URL on staging point at staging's own URLs, not prod's. The `expire-overrides-daily` cron's Bearer JWT is staging's `service_role` token (project ref `nuuffnxjsjqdoubvrtcl` baked in), so it cannot authenticate against prod even if URL-swapped by accident. |
| **External integrations** | Staging uses the `AIME Staging` GHL sub-account (Location ID `PJAAN2zV4gJW33Sbm5Sr`), not prod's `AIME` sub-account. Staging uses Stripe TEST mode keys, not LIVE. A misconfigured staging client cannot inadvertently write to prod's CRM or billing. |
| **Storage** | Per-project S3 buckets. Staging files are physically distinct from prod's. |
| **Billing** | Staging is a separate Pro project line item. Deleting it stops staging billing without touching prod's. |

**Implication:** Settings → Delete project on `amp-staging` is a one-click, prod-safe operation. The only thing lost is the staging environment itself, which can be rebuilt from a fresh prod backup in ~1 hour.

## When to roll back

Roll back the entire staging Supabase project when one or more of these are true:
- Schema or data corruption beyond what a single migration revert can fix.
- A destructive operation was run against the wrong project (staging is the cushion; if staging itself is wrong, restart it).
- Cloned state has drifted from prod enough that staging is no longer a faithful test environment (e.g., months of accumulated test data or schema divergence).
- Team needs a fresh prod snapshot for a specific test.

Do **not** roll back for: a bad cron job (re-run the recreate SQL), a bad trigger (re-run the trigger fix SQL), a single bad migration (revert via `supabase db push` or manual SQL).

## Rollback steps

### 1. Delete the broken staging project
- Supabase Dashboard → `amp-staging` → Settings → General → scroll to the bottom → **Delete project**.
- Confirm by typing the project name.

### 2. Re-clone from latest prod backup
- Supabase Dashboard → `amp` (prod) → Database → Backups → **Restore to a new project (BETA)**.
- Name: `amp-staging`.
- Region: `us-east-1` (East US, North Virginia) — must match prod.
- Compute: SMALL during restore; downsize to Micro after if desired.
- Backup source: latest available daily backup (`amp` is on Pro tier, daily PITR backups).
- Generate + save a new DB password to your password manager.

### 3. Capture the new project ref + JWT keys
- New project will have a different ref (the URL `https://<ref>.supabase.co` changes).
- Settings → API → copy `Project URL`, `anon public` key, `service_role` key.
- Update `.env.staging` (gitignored) with the new values.

### 4. Update consumers of the old staging ref
Anywhere that referenced the old staging ref needs swapping to the new one:
- `.env.staging` — anon key, service_role key, project URL, DB password.
- Railway staging environment env vars (when AIME-5 lands) — same set.
- Edge Function secrets in the new staging Supabase project (when AIME-7 lands).
- Any local SQL scripts in this repo that hardcode `nuuffnxjsjqdoubvrtcl` (this doc included).

### 5. Disable pg_cron + pg_net immediately post-clone
The clone copies these enabled with all 3 cron jobs active and pointing at prod URLs. **Disable both extensions before doing anything else** to stop staging cron from firing prod webhooks.

Database → Extensions → search `pg_cron` → toggle off (warning: scheduled jobs deleted — that's the point). Repeat for `pg_net`.

### 6. Re-enable pg_cron + pg_net
After confirming staging is otherwise stable.

### 7. Re-run staging-side post-clone SQL
Two scripts in `supabase/scripts/`:

- **`supabase/scripts/staging-cron-recreate.sql`** — recreates 3 cron jobs (`reset-annual-escalations`, `expire-overrides-daily`, `sync-stripe-subscriptions`) with URL + JWT swapped from prod to staging.
- **`supabase/scripts/staging-ghl-trigger-fix.sql`** — `CREATE OR REPLACE FUNCTION sync_profile_to_ghl()` with `supabase_url` constant pointing at staging.

If you re-clone to a brand-new staging project ref (different from `nuuffnxjsjqdoubvrtcl`), find/replace the ref in both files before running.

### 8. Re-apply auth config that doesn't survive the clone
Per Supabase docs, the following are NOT cloned:
- Custom SMTP settings — re-enter Resend creds (`smtp.resend.com:465`, sender `noreply@notifications.aimegroup.com`, name `AIME`, username `resend`, password = a Resend API key restricted to the `notifications.aimegroup.com` domain with sending-only access).
- Auth URL Configuration (Site URL, redirect URLs).
- Auth Rate Limits — but these did appear cloned in our 2026-04-30 attempt; verify and re-mirror prod values if missing (30 emails/h, 150 refresh/5min, 30 verify/5min, 30 signup/5min).
- Storage objects (bucket *configurations* are part of the schema dump and DO clone; the actual files don't).

### 9. Migration history fix (only if using `supabase db push`)
The migration history table `supabase_migrations.schema_migrations` is part of the cloned schema, so it should arrive populated. If `supabase db push --dry-run` reports a mismatch, re-run the timestamp normalization that was done in initial AIME-4 setup (see `staging-environment.md` memory + git history of `supabase/migrations/`).

### 10. Edge Functions
Edge Functions are NOT cloned. Re-deploy via:
```
supabase link --project-ref nuuffnxjsjqdoubvrtcl  # use new ref after re-clone
supabase functions deploy --project-ref nuuffnxjsjqdoubvrtcl
```

### 11. Smoke test
- Confirm a test user can log in (auth works, custom SMTP delivers confirmation email).
- Trigger a profile update — verify it shows in AIME Staging GHL sub-account (and NOT prod AIME).
- Confirm cron jobs are scheduled: `SELECT jobname, schedule, active FROM cron.job;` against staging.

## Recovery time estimate
- Delete + clone: ~10–15 min (clone restore is the slow step).
- Manual reconfig (steps 3–10): ~30–45 min if scripts are pre-written.
- Total: ~1 hour for an experienced dev who has done this before.

## What this plan does NOT cover
- **Rolling forward a partial migration failure.** Use `supabase migration repair` or manual `UPDATE supabase_migrations.schema_migrations` instead.
- **Rolling back a single bad cron job** — `SELECT cron.unschedule('jobname');` then re-create.
- **Rolling back prod.** This doc is staging-only. Prod rollback uses Supabase's Point-in-Time Recovery on the `amp` project.
