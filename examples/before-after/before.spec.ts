// BEFORE: a brittle test of the kind found in a legacy suite.
// This folder is outside testDir, so Playwright never runs it. ESLint skips this file on purpose.
import { test, expect } from '@playwright/test';

test('login and add to cart', async ({ page }) => {
  await page.goto('https://www.saucedemo.com/');                       // ❌ hard-coded URL
  await page.fill('#user-name', 'standard_user');
  await page.fill('#password', 'hard-coded-password');                 // ❌ secret in source control
  await page.click('/html/body/div/div/div[2]/div[1]/div/div/form/input'); // ❌ absolute XPath
  await page.waitForTimeout(5000);                                     // ❌ fixed wait: slow AND flaky
  await page.click('(//button)[3]', { force: true });                  // ❌ position-based, force hides real problems
  const badge = await page.$('.shopping_cart_badge');                  // ❌ ElementHandle, no auto-wait
  expect(await badge?.textContent()).toBe('1');                        // ❌ one-shot check, no retry
});
