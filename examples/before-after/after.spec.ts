// AFTER: the same test, rewritten with page objects, env and web-first assertions.
// Lives outside testDir like the "before" file, so it is for reading only.
// The live version of this flow is tests/sauce/checkout.spec.ts.
import { test, expect } from '../../fixtures/test-fixtures';
import { env } from '../../utils/env';

test.use({ storageState: { cookies: [], origins: [] } });

test('login and add to cart', async ({ loginPage, inventoryPage }) => {
  await loginPage.goto();                                           // ✅ baseURL comes from env
  await loginPage.login(env.sauceUser, env.saucePassword);          // ✅ credentials from .env / CI secrets
  await inventoryPage.expectLoaded();                               // ✅ waits for the page, no fixed sleep
  await inventoryPage.addToCart('Sauce Labs Backpack');             // ✅ item found by name, button by role
  await expect(inventoryPage.cartBadge).toHaveText('1');            // ✅ retries until true or timeout
});
