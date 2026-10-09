import type { Locator, Page } from '@playwright/test';

export type Customer = { firstName: string; lastName: string; postalCode: string };

// Covers the three checkout screens: your information, overview, complete.
export class CheckoutPage {
  readonly page: Page;
  readonly firstNameInput: Locator;
  readonly lastNameInput: Locator;
  readonly postalCodeInput: Locator;
  readonly continueButton: Locator;
  readonly overviewItems: Locator;
  readonly subtotal: Locator;
  readonly finishButton: Locator;
  readonly completeHeader: Locator;

  constructor(page: Page) {
    this.page = page;
    this.firstNameInput = page.getByRole('textbox', { name: 'First Name' });
    this.lastNameInput = page.getByRole('textbox', { name: 'Last Name' });
    this.postalCodeInput = page.getByRole('textbox', { name: 'Zip/Postal Code' });
    this.continueButton = page.getByRole('button', { name: 'Continue' });
    this.overviewItems = page.getByTestId('inventory-item');
    this.subtotal = page.getByTestId('subtotal-label');
    this.finishButton = page.getByRole('button', { name: 'Finish' });
    this.completeHeader = page.getByTestId('complete-header');
  }

  async enterCustomer(customer: Customer) {
    await this.firstNameInput.fill(customer.firstName);
    await this.lastNameInput.fill(customer.lastName);
    await this.postalCodeInput.fill(customer.postalCode);
    await this.continueButton.click();
  }

  async finish() {
    await this.finishButton.click();
  }
}
