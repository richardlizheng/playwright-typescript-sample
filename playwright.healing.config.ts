import { defineConfig, devices } from '@playwright/test';

// Standalone, deterministic coverage: no .env, login setup or external websites.
export default defineConfig({
  testDir: './tests/self-healing',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 2,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report/healing' }]],
  use: { testIdAttribute: 'data-test', trace: 'retain-on-failure' },
  projects: [
    { name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
    { name: 'edge', use: { ...devices['Desktop Edge'], channel: 'msedge' } },
  ],
});
