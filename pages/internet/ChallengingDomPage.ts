import type { Locator, Page } from '@playwright/test';
import { env } from '../../utils/env';
import { openPage } from '../../utils/navigation';
import type { SelfHealing } from '../../utils/self-healing/self-healing';

// This page is built to break bad locators:
// - the three coloured buttons get new random ids AND new labels on every load
// - the table has no ids, classes or test ids
export class ChallengingDomPage {
  readonly page: Page;
  readonly coloredButtons: Locator;
  readonly rows: Locator;

  constructor(page: Page, private readonly selfHealing: SelfHealing) {
    this.page = page;
    // Ids and text both change, so the stable class is the only reliable hook.
    // They are <a> tags, so their role is "link", not "button".
    this.coloredButtons = page.locator('a.button');
    this.rows = page.getByRole('row');
  }

  async goto() {
    await openPage(this.page, `${env.internetBaseUrl}/challenging_dom`);
  }

  // Find the row by the exact text of its first cell, not by its position.
  // exact: true so "Iuvaret1" does not also match a future "Iuvaret10".
  row(firstCellText: string): Locator {
    return this.rows.filter({ has: this.page.getByRole('cell', { name: firstCellText, exact: true }) });
  }

  async editRow(firstCellText: string) {
    // Recovery stays inside this row, so another row's "edit" can never win.
    await this.selfHealing.click(this.row(firstCellText), 'challengingDom.edit');
  }
}
