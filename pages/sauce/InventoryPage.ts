import { expect, type Locator, type Page } from '@playwright/test';
import { openPage } from '../../utils/navigation';

export class InventoryPage {
  readonly page: Page;
  readonly title: Locator;
  readonly items: Locator;
  readonly addToCartButtons: Locator;
  readonly cartLink: Locator;
  readonly cartBadge: Locator;

  constructor(page: Page) {
    this.page = page;
    this.title = page.getByTestId('title');
    this.items = page.getByTestId('inventory-item');
    // Each button's data-test ends with the product name (add-to-cart-sauce-labs-backpack),
    // so the full value changes per item. Match on the stable prefix with CSS "starts with" (^=).
    this.addToCartButtons = page.locator('[data-test^="add-to-cart-"]');
    this.cartLink = page.getByTestId('shopping-cart-link');
    this.cartBadge = page.getByTestId('shopping-cart-badge');
  }

  async goto() {
    await openPage(this.page, '/inventory.html');
  }

  // The one assertion allowed in a page object: "am I on this page?"
  async expectLoaded() {
    await expect(this.page).toHaveURL(/\/inventory\.html$/);
    await expect(this.title).toHaveText('Products');
  }

  item(productName: string): Locator {
    return this.items.filter({ hasText: productName });
  }

  async addToCart(productName: string) {
    await this.item(productName).getByRole('button', { name: 'Add to cart' }).click();
  }

  async removeFromCart(productName: string) {
    await this.item(productName).getByRole('button', { name: 'Remove' }).click();
  }

  async openCart() {
    await this.cartLink.click();
  }
}
