import { test as setup } from '../fixtures/test-fixtures';
import { AUTH_FILE } from '../playwright.config';
import { env } from '../utils/env';

// Log in once, save cookies + local storage, and let every UI test start already logged in.
// The file holds a live session, so .auth/ is git-ignored.
// Note: Sauce Demo's session cookie lasts 10 minutes, which is longer than a full run.
setup('log in to Sauce Demo', async ({ page, loginPage, inventoryPage }) => {
  await loginPage.goto();
  await loginPage.login(env.sauceUser, env.saucePassword);
  await inventoryPage.expectLoaded();
  await page.context().storageState({ path: AUTH_FILE });
});
