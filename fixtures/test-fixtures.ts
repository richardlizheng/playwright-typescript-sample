import { test as base } from '@playwright/test';
import { LoginPage } from '../pages/sauce/LoginPage';
import { InventoryPage } from '../pages/sauce/InventoryPage';
import { CartPage } from '../pages/sauce/CartPage';
import { CheckoutPage } from '../pages/sauce/CheckoutPage';
import { DynamicLoadingPage } from '../pages/internet/DynamicLoadingPage';
import { DynamicControlsPage } from '../pages/internet/DynamicControlsPage';
import { ChallengingDomPage } from '../pages/internet/ChallengingDomPage';

type Pages = {
  loginPage: LoginPage;
  inventoryPage: InventoryPage;
  cartPage: CartPage;
  checkoutPage: CheckoutPage;
  dynamicLoadingPage: DynamicLoadingPage;
  dynamicControlsPage: DynamicControlsPage;
  challengingDomPage: ChallengingDomPage;
};

// Requests the tests never need: analytics, an icon font and unused UI libraries on The Internet.
// One of them sometimes hangs for 30 seconds and holds up the page "load" event.
// Blocking them makes the practice site faster and the tests less flaky.
const NOISE = /optimizely|\/js\/vendor\/\d+\.js|font-awesome|jquery-ui|foundation|forkme/;

export const test = base.extend<Pages>({
  // Route on the context, not the page, so new tabs and pop-ups are covered too.
  context: async ({ context }, use) => {
    await context.route(NOISE, (route) => route.abort());
    await use(context);
  },
  loginPage: async ({ page }, use) => { await use(new LoginPage(page)); },
  inventoryPage: async ({ page }, use) => { await use(new InventoryPage(page)); },
  cartPage: async ({ page }, use) => { await use(new CartPage(page)); },
  checkoutPage: async ({ page }, use) => { await use(new CheckoutPage(page)); },
  dynamicLoadingPage: async ({ page }, use) => { await use(new DynamicLoadingPage(page)); },
  dynamicControlsPage: async ({ page }, use) => { await use(new DynamicControlsPage(page)); },
  challengingDomPage: async ({ page }, use) => { await use(new ChallengingDomPage(page)); },
});

export { expect } from '@playwright/test';
