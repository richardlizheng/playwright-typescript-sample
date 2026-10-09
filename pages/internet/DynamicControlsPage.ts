import type { Locator, Page } from '@playwright/test';
import { env } from '../../utils/env';
import { openPage } from '../../utils/navigation';

export class DynamicControlsPage {
  readonly page: Page;
  readonly checkbox: Locator;
  readonly removeButton: Locator;
  readonly textInput: Locator;
  readonly enableButton: Locator;
  readonly message: Locator;

  constructor(page: Page) {
    this.page = page;
    this.checkbox = page.getByRole('checkbox');
    this.removeButton = page.getByRole('button', { name: 'Remove' });
    this.textInput = page.getByRole('textbox');
    this.enableButton = page.getByRole('button', { name: 'Enable' });
    // The status line has no role or label; its id is stable, so CSS is fine here.
    this.message = page.locator('#message');
  }

  async goto() {
    await openPage(this.page, `${env.internetBaseUrl}/dynamic_controls`);
  }

  async removeCheckbox() {
    await this.removeButton.click();
  }

  async enableInput() {
    await this.enableButton.click();
  }
}
