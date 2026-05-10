/**
 * AIME-11 auth setup: logs in the fixture user once and saves the
 * resulting cookies + localStorage to disk. The `authenticated` project
 * in playwright.config.ts loads this saved state, so the 4 page-load
 * tests in dashboard.spec.ts skip the login overhead entirely.
 */
import { test as setup } from '@playwright/test';
import { loginAs } from './helpers/login';

const email = process.env.SMOKE_USER_EMAIL ?? '';
const password = process.env.SMOKE_USER_PASSWORD ?? '';

const AUTH_STATE_PATH = 'e2e/smoke/.auth/user.json';

setup('authenticate fixture user', async ({ page }) => {
  if (!email || !password) {
    throw new Error('SMOKE_USER_EMAIL and SMOKE_USER_PASSWORD must be set');
  }
  await loginAs(page, email, password);
  await page.context().storageState({ path: AUTH_STATE_PATH });
});
