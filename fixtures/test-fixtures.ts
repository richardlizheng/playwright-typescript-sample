import { test as base } from '@playwright/test';
import { LoginPage } from '../pages/sauce/LoginPage';
import { InventoryPage } from '../pages/sauce/InventoryPage';
import { CartPage } from '../pages/sauce/CartPage';
import { CheckoutPage } from '../pages/sauce/CheckoutPage';
import { DynamicLoadingPage } from '../pages/internet/DynamicLoadingPage';
import { DynamicControlsPage } from '../pages/internet/DynamicControlsPage';
import { ChallengingDomPage } from '../pages/internet/ChallengingDomPage';
import { LocatorStore } from '../utils/self-healing/locator-store';
import { healingMode, SelfHealing } from '../utils/self-healing/self-healing';
import type { HealingMode, RecoveryEvent } from '../utils/self-healing/types';
import { resolve } from 'node:path';

type Pages = {
  // SELF_HEALING=off|report|fail (default report). Override per file with test.use({ selfHealingMode }).
  selfHealingMode: HealingMode;
  selfHealing: SelfHealing;
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
  selfHealingMode: [healingMode(process.env.SELF_HEALING), { option: true }],
  selfHealing: async ({ selfHealingMode }, use, testInfo) => {
    const events: RecoveryEvent[] = [];
    const healing = new SelfHealing(LocatorStore.fromDir(resolve(__dirname, '../locators')), {
      heal: selfHealingMode !== 'off',
      onRecovery: (event) => {
        events.push(event);
        testInfo.annotations.push({ type: 'self-healing', description: `${event.key}: ${event.method}` });
      },
    });
    try {
      await use(healing);
    } finally {
      // The reporter collects these into reports/self-healing.json.
      if (events.length) await testInfo.attach('self-healing.json', {
        body: JSON.stringify(events, null, 2), contentType: 'application/json',
      });
    }
    // The test ran to the end with the healed locator, so its own assertions were checked too.
    if (selfHealingMode === 'fail' && events.length) {
      throw new Error(`Self-healing was needed for ${[...new Set(events.map((event) => event.key))].join(', ')}. ` +
        'Update locators/ (npm run healing:apply) or run with SELF_HEALING=report.');
    }
  },
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
