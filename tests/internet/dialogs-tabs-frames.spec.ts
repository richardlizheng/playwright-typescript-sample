import { test, expect } from '../../fixtures/test-fixtures';
import { env } from '../../utils/env';
import { openPage } from '../../utils/navigation';

// These tests show Playwright APIs, so the locators stay inline instead of in page objects.

test('JS alert is accepted', { tag: ['@regression'] }, async ({ page }) => {
  await openPage(page, `${env.internetBaseUrl}/javascript_alerts`);
  // Register the handler BEFORE the click. Without one, Playwright dismisses dialogs automatically.
  page.on('dialog', (dialog) => dialog.accept());

  await page.getByRole('button', { name: 'Click for JS Alert' }).click();
  await expect(page.locator('#result')).toHaveText('You successfully clicked an alert');
});

test('JS prompt receives typed text', { tag: ['@regression'] }, async ({ page }) => {
  await openPage(page, `${env.internetBaseUrl}/javascript_alerts`);
  // Save the message and assert it after the click. A failed expect inside a handler
  // would not fail the test cleanly.
  let promptMessage = '';
  page.once('dialog', (dialog) => {
    promptMessage = dialog.message();
    void dialog.accept('hello from Playwright');
  });

  await page.getByRole('button', { name: 'Click for JS Prompt' }).click();
  expect(promptMessage).toBe('I am a JS prompt');
  await expect(page.locator('#result')).toHaveText('You entered: hello from Playwright');
});

test('link opens a new tab', { tag: ['@regression'] }, async ({ page }) => {
  await openPage(page, `${env.internetBaseUrl}/windows`);

  // Start waiting for the pop-up before the click that opens it, so the event is not missed.
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('link', { name: 'Click Here' }).click();
  const newTab = await popupPromise;

  await expect(newTab.getByRole('heading', { name: 'New Window' })).toBeVisible();
  await expect(newTab).toHaveURL(/\/windows\/new$/);
});

test('text inside nested frames is reachable', { tag: ['@regression'] }, async ({ page }) => {
  await openPage(page, `${env.internetBaseUrl}/nested_frames`);

  const topFrame = page.frameLocator('frame[name="frame-top"]');
  await expect(topFrame.frameLocator('frame[name="frame-middle"]').locator('body')).toHaveText('MIDDLE');
  await expect(page.frameLocator('frame[name="frame-bottom"]').locator('body')).toHaveText('BOTTOM');
});
