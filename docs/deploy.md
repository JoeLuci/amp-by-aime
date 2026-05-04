# Deploy workflow

How code gets from a dev branch to staging to production, who approves, and
how to roll back when something breaks.

## TL;DR

```
                                  PR #1               QA on staging URL              PR #2
  feature/<ticket>  ───────►  staging branch  ─────────────────────────────►  main branch
        │                            │                                              │
        │                            ▼                                              ▼
        │                      Railway staging                                 Railway prod
        │                      (auto-deploys                                   (auto-deploys
        │                       on push)                                        on push)
        │                            │                                              │
        ▼                            ▼                                              ▼
  no deploy                  aime-amp-staging                              app.brokersarebest.com
                             .up.railway.app
```

Two branches deploy automatically:
- `staging` → Railway staging environment
- `main` → Railway production environment

Feature branches do NOT deploy.

## Numbered steps

1. **Pull latest `main`** before starting work:
   ```
   git checkout main && git pull origin main
   ```

2. **Create a feature branch** off `main`. Name it after the Jira ticket:
   ```
   git checkout -b aime-12-add-foo-feature
   ```

3. **Develop + commit locally.** Keep commits scoped — explain WHY in the
   message, not WHAT.

4. **Push the branch:**
   ```
   git push -u origin aime-12-add-foo-feature
   ```

5. **Open PR #1: feature branch → `staging`** on GitHub. This is the staging
   gate. Get review approval, merge it. Railway staging redeploys
   automatically on the merge commit. URL:
   `https://aime-amp-staging.up.railway.app/`

6. **QA on staging.** Walk through the affected user flows. Watch the
   Railway staging build logs + the staging Supabase Edge Function logs +
   the staging Stripe webhook deliveries page. If anything's broken, fix on
   the same feature branch and push again — staging redeploys.

7. **Open PR #2: feature branch → `main`** once staging QA is clean. This
   is the prod gate — same reviewer expectations as PR #1, often stricter
   because the change has now been validated on staging. Merge releases to
   prod. Railway prod redeploys automatically.

8. **Verify on prod** (`https://app.brokersarebest.com/`). Watch Railway
   prod logs + Supabase prod logs + Stripe prod webhook deliveries during
   the rollout window.

## Approvers

| PR target  | Reviewers required                                              |
| ---------- | --------------------------------------------------------------- |
| `staging`  | At least one reviewer with write access. Author can self-merge for trivial doc/comment-only changes. |
| `main`     | At least one reviewer who did not author the change. Author cannot self-merge. |

**Hard rules:**
- Never push directly to `main` or `staging` from a working branch
  (see [`memory/feedback_branch_workflow.md`](../.claude/projects/-Users-akbar-Desktop-aime-amp-by-aime/memory/feedback_branch_workflow.md))
- Never merge to `main` locally — `main` is updated only via PR merge on GitHub
- PRs are created manually by the author (not by automation)

## Rollback

### Railway (replaces "Vercel" in the original AC text — actual platform is Railway)

**Fast rollback (preferred, no git history change):**
1. Railway dashboard → `aime-amp` service → switch env (top-left dropdown) to `production` (or `staging` for staging rollback)
2. **Deployments** tab → find the last known-good deploy
3. Click the `…` menu → **Redeploy**
4. Railway re-runs the build from that deploy's source ref. Roll-forward time: typically 2-4 min.

**Git rollback (cleaner audit trail):**
1. On GitHub, find the PR that introduced the regression
2. Click **Revert** to open a revert PR
3. Merge the revert PR into `main` → Railway rebuilds from the reverted state

**Note:** environment variables don't change with redeploy. If the
regression was caused by an env var change, fix the var in Railway and
redeploy any version (the new env applies on next deploy).

### Supabase migrations

Postgres migrations applied via `supabase db push` are NOT automatically
reversible. Strategy depends on what changed:

**Schema changes (CREATE/ALTER/DROP):**
1. Write a forward-only reverse migration (e.g., `DROP TABLE foo` if the bad migration did `CREATE TABLE foo`)
2. Apply via `supabase db push`
3. Commit the reverse migration to the repo so it's part of history

**Data corruption / unrecoverable schema mistake:**
1. Supabase Dashboard → Project Settings → Database → **Backups**
2. Restore the most recent good backup. Daily PITR backups are retained per Pro tier
3. **Caveat:** restoring the prod DB would lose all data after the snapshot — only use as last resort
4. For staging, the [`docs/staging-supabase-rollback.md`](./staging-supabase-rollback.md) doc covers re-cloning from a fresh prod snapshot — much faster than fixing in place

**Edge Function code:**
1. `supabase functions deploy <name>` always replaces with the latest code from `supabase/functions/<name>/`
2. To roll back: revert the code in git, redeploy. Supabase keeps a version history (visible in dashboard) but the CLI doesn't have a "redeploy version N" command; you have to deploy from the rolled-back source

**Edge Function secrets:**
1. `supabase secrets set --project-ref <ref> KEY=<value>` overwrites
2. To roll back a bad secret value, set it back to the previous value (which you should have saved in 1Password before changing)

### Stripe webhooks

**Webhook endpoint API version regression:**
1. Stripe dashboard → Developers → Webhooks → click the endpoint
2. Top-right gear → **Edit endpoint** → change API version
3. Stripe will replay events in the new format on next event (no automatic retroactive replay)
4. If your handler crashes on old-format events: roll back the handler code first, then change the version

**Bad webhook signing secret rotation:**
1. Stripe dashboard → endpoint → **Roll signing secret** generates a new `whsec_…`
2. The old secret stays valid for 24 hours by default (so you have a safe window to update consumers)
3. Update `STRIPE_WEBHOOK_SECRET` in Railway env (prod or staging) AND Supabase Edge Function secrets
4. Trigger a redeploy to pick up the new env var

**Bad webhook handler logic:**
1. Revert the handler code in git → redeploy (covered above under Railway rollback)
2. While the bug is live: events that fail signature verification or 5xx are retried by Stripe with exponential backoff for 3 days. So a quick rollback typically catches up without manual replay
3. To force replay of a specific event: dashboard → Developers → Events → find the event → **Resend webhook**

## Related docs

- [`scripts/refresh-staging-data/README.md`](../scripts/refresh-staging-data/README.md) — refresh staging Supabase + GHL data from prod
- [`docs/staging-supabase-rollback.md`](./staging-supabase-rollback.md) — fast-rollback procedure for the staging Supabase project specifically
- Top-level [`README.md`](../README.md) — env var runbook
