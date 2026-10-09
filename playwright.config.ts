import { defineConfig, devices } from '@playwright/test';
import { env } from './utils/env';

export const AUTH_FILE = '.auth/user.json';

// Both Chrome and Edge are Chromium, so they share these flags.
// The Internet's host stalls on HTTP/2 when many files load at once (requests hang for 30 seconds).
// HTTP/1.1 avoids that. Sauce Demo works the same either way.
const chromiumArgs = ['--disable-http2'];

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Low on purpose: these are shared public practice sites. The Internet runs on one small
  // host; with more parallel browsers it starts to queue requests and return 503s.
  workers: 2,
  // The dynamic pages wait 3–5 seconds on purpose, so allow a little more than the 5s default.
  expect: { timeout: 10_000 },
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['json', { outputFile: 'reports/results.json' }],
  ],
  use: {
    baseURL: env.sauceBaseUrl,
    testIdAttribute: 'data-test',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    // Logs in once and saves the session for the UI projects.
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
      use: { ...devices['Desktop Chrome'], channel: 'chrome', launchOptions: { args: chromiumArgs } },
    },
    // API tests need no browser, so they run once instead of once per browser.
    {
      name: 'api',
      testMatch: /.*\.api\.spec\.ts/,
    },
    {
      name: 'chrome',
      testIgnore: /.*\.api\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        launchOptions: { args: chromiumArgs },
        storageState: AUTH_FILE,
      },
    },
    {
      name: 'edge',
      testIgnore: /.*\.api\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Edge'],
        channel: 'msedge',
        launchOptions: { args: chromiumArgs },
        storageState: AUTH_FILE,
      },
    },
  ],
});
