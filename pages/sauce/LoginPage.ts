import type { Locator, Page } from '@playwright/test';
import { openPage } from '../../utils/navigation';

export class LoginPage {
  readonly page: Page;
  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.usernameInput = page.getByRole('textbox', { name: 'Username' });
    // A password field has no ARIA role in the spec, so the label is the clearest locator.
    this.passwordInput = page.getByLabel('Password');
    // <input type="submit" value="Login"> has the role "button" and the name "Login".
    this.loginButton = page.getByRole('button', { name: 'Login' });
    this.errorMessage = page.getByTestId('error');
  }

  async goto() {
    await openPage(this.page, '/');
  }

  async login(username: string, password: string) {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }
}
