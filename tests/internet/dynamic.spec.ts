import { test, expect } from '../../fixtures/test-fixtures';

// No fixed waits anywhere. Web-first assertions retry until the condition is true
// or the expect timeout (10s, see playwright.config.ts) runs out.

test('text that is rendered after loading appears', { tag: ['@regression'] }, async ({ dynamicLoadingPage }) => {
  await dynamicLoadingPage.goto(2);
  await expect(dynamicLoadingPage.loadedText).toHaveCount(0); // not in the DOM yet

  await dynamicLoadingPage.start();
  await expect(dynamicLoadingPage.loadedText).toBeVisible();
});

test('disabled input becomes enabled', { tag: ['@smoke', '@regression'] }, async ({ dynamicControlsPage }) => {
  await dynamicControlsPage.goto();
  await expect(dynamicControlsPage.textInput).toBeDisabled();

  await dynamicControlsPage.enableInput();
  await expect(dynamicControlsPage.textInput).toBeEnabled();
  await expect(dynamicControlsPage.message).toHaveText("It's enabled!");
  await dynamicControlsPage.textInput.fill('typed after enable');
  await expect(dynamicControlsPage.textInput).toHaveValue('typed after enable');
});

test('checkbox is removed from the page', { tag: ['@regression'] }, async ({ dynamicControlsPage }) => {
  await dynamicControlsPage.goto();
  await expect(dynamicControlsPage.checkbox).toBeVisible();

  await dynamicControlsPage.removeCheckbox();
  await expect(dynamicControlsPage.checkbox).toBeHidden();
  await expect(dynamicControlsPage.message).toHaveText("It's gone!");
});
