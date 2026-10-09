import type { Locator, Page } from '@playwright/test';
import { env } from '../../utils/env';
import { openPage } from '../../utils/navigation';

export class DynamicLoadingPage {
  readonly page: Page;
  readonly startButton: Locator;
  readonly loadedText: Locator;

  constructor(page: Page) {
    this.page = page;
    this.startButton = page.getByRole('button', { name: 'Start' });
    this.loadedText = page.getByText('Hello World!');
  }

  // Example 1 hides the text in the DOM; example 2 only adds it after loading.
  async goto(example: 1 | 2) {
    await openPage(this.page, `${env.internetBaseUrl}/dynamic_loading/${example}`);
  }

  async start() {
    await this.startButton.click();
  }
}
