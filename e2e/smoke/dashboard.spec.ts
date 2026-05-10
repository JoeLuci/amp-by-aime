/**
 * AIME-11 smoke tests: the 4 "view X" page-load checks.
 *
 * These tests run inside the `authenticated` project (see
 * playwright.config.ts), which depends on `auth.setup.ts` to produce a
 * shared storageState. As a result, no per-test login is needed — the
 * tests open already-authenticated browser contexts.
 */
import { test, expect } from '@playwright/test';

test('view home — /dashboard renders', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText('Featured', { exact: true }).first()).toBeVisible();
});

test('view escalation — /dashboard/purchase-escalations renders', async ({ page }) => {
  await page.goto('/dashboard/purchase-escalations');
  await expect(page).toHaveURL(/\/dashboard\/purchase-escalations/);
  await expect(page.getByRole('heading', { name: 'Purchase Escalations' })).toBeVisible();
});

// /dashboard/market is the vendor-listing page in this codebase
// (h1 "MARKET", body sections "Core Vendor Partner" / "Vendor Members
// & Partners"). Test name uses AC language ("vendor listing"); URL is
// what the route is.
test('view vendor listing — /dashboard/market renders', async ({ page }) => {
  await page.goto('/dashboard/market');
  await expect(page).toHaveURL(/\/dashboard\/market/);
  await expect(page.getByRole('heading', { name: 'MARKET' })).toBeVisible();
});

test('load resources tab — /dashboard/resources renders', async ({ page }) => {
  await page.goto('/dashboard/resources');
  await expect(page).toHaveURL(/\/dashboard\/resources/);
  await expect(page.getByRole('heading', { name: 'RESOURCES' })).toBeVisible();
});
