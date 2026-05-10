import { defineConfig, devices } from '@playwright/test';

const AUTH_STATE_PATH = 'e2e/smoke/.auth/user.json';

export default defineConfig({
  testDir: '.',
  timeout: 20_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['list'],
  ],
  use: {
    baseURL: process.env.SMOKE_BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // The standalone login-flow test. No dependency on setup, no shared
      // storageState — so if auth is broken, this test still runs and
      // reports the actual UI-side login failure independently.
      name: 'login-flow',
      testMatch: /login\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // The authenticated page-load tests reuse the storageState produced
      // by `setup`, so login only happens once across all 4 tests.
      name: 'authenticated',
      testMatch: /dashboard\.spec\.ts$/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: AUTH_STATE_PATH,
      },
    },
  ],
});
