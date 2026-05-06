/**
 * AIME-11 smoke test: login flow.
 *
 * Runs in the `login-flow` project (no shared storageState, no setup
 * dependency) so it always exercises a fresh login through the actual
 * UI. If staging auth breaks, this test reports the failure
 * independently of the auth.setup helper.
 *
 * The fixture user lives in staging Supabase. If the staging data is
 * re-seeded via scripts/refresh-staging-data, the fixture's profiles
 * row may be wiped — re-run the fixture SQL from
 * docs/superpowers/specs/2026-05-06-aime-11-staging-smoke-tests-design.md
 * to restore it.
 */
import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/login';

const email = process.env.SMOKE_USER_EMAIL ?? '';
const password = process.env.SMOKE_USER_PASSWORD ?? '';

test.beforeAll(() => {
  if (!email || !password) {
    throw new Error('SMOKE_USER_EMAIL and SMOKE_USER_PASSWORD must be set');
  }
});

test('login redirects to /dashboard, not /onboarding', async ({ page }) => {
  await loginAs(page, email, password);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText('Featured', { exact: true }).first()).toBeVisible();
});
