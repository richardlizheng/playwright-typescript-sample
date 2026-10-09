import { test, expect } from '../../fixtures/test-fixtures';
import loginCases from '../../test-data/login-cases.json';
import { env } from '../../utils/env';

// Usernames come from the JSON file. The real password only ever comes from env.
const passwordFor = (kind: string) => (kind === 'empty' ? '' : env.saucePassword);

test.describe('Login', () => {
  // These tests check the login form itself, so start logged out.
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const user of loginCases.valid) {
    test(user.title, { tag: ['@regression', ...user.tags] }, async ({ loginPage, inventoryPage }) => {
      await loginPage.goto();
      await loginPage.login(user.username, env.saucePassword);
      await inventoryPage.expectLoaded();
    });
  }

  for (const user of loginCases.invalid) {
    test(user.title, { tag: ['@regression'] }, async ({ page, loginPage }) => {
      await loginPage.goto();
      await loginPage.login(user.username, passwordFor(user.password));
      await expect(loginPage.errorMessage).toHaveText(user.error);
      await expect(page).not.toHaveURL(/inventory/);
    });
  }
});
