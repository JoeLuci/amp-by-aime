import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export async function loginAs(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto('/sign-in');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: /log in/i }).click();
  await page.waitForURL((url) => url.pathname.startsWith('/dashboard'), {
    timeout: 15_000,
  });
  await expect(page).toHaveURL(/\/dashboard/);
}
