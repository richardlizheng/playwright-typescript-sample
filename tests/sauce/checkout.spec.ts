import { test, expect } from '../../fixtures/test-fixtures';
import type { Customer } from '../../pages/sauce/CheckoutPage';

// Every test here starts logged in, using the state saved by auth.setup.ts.
const BACKPACK = 'Sauce Labs Backpack';
const BIKE_LIGHT = 'Sauce Labs Bike Light';
const customer: Customer = { firstName: 'Test', lastName: 'Buyer', postalCode: '12345' };

test.beforeEach(async ({ inventoryPage }) => {
  await inventoryPage.goto();
  await inventoryPage.expectLoaded();
});

test('product list shows six products to add', { tag: ['@smoke', '@regression'] }, async ({ inventoryPage }) => {
  await expect(inventoryPage.items).toHaveCount(6);
  await expect(inventoryPage.addToCartButtons).toHaveCount(6);
});

test('cart badge follows items added and removed', { tag: ['@regression'] }, async ({ inventoryPage }) => {
  await inventoryPage.addToCart(BACKPACK);
  await inventoryPage.addToCart(BIKE_LIGHT);
  await expect(inventoryPage.cartBadge).toHaveText('2');

  await inventoryPage.removeFromCart(BACKPACK);
  await expect(inventoryPage.cartBadge).toHaveText('1');
});

test('customer buys two items', { tag: ['@e2e', '@regression'] }, async ({ inventoryPage, cartPage, checkoutPage }) => {
  await test.step('Add two items to the cart', async () => {
    await inventoryPage.addToCart(BACKPACK);
    await inventoryPage.addToCart(BIKE_LIGHT);
    await expect(inventoryPage.cartBadge).toHaveText('2');
  });

  await test.step('Cart shows both items', async () => {
    await inventoryPage.openCart();
    await expect(cartPage.items).toHaveCount(2);
    await expect(cartPage.itemNames).toHaveText([BACKPACK, BIKE_LIGHT]);
  });

  await test.step('Enter customer details', async () => {
    await cartPage.checkout();
    await checkoutPage.enterCustomer(customer);
    await expect(checkoutPage.overviewItems).toHaveCount(2);
    await expect(checkoutPage.subtotal).toHaveText('Item total: $39.98');
  });

  await test.step('Finish and see the confirmation', async () => {
    await checkoutPage.finish();
    await expect(checkoutPage.completeHeader).toHaveText('Thank you for your order!');
  });
});
