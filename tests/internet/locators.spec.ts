import { test, expect } from '../../fixtures/test-fixtures';

test('edit link is found by its row text, not by position or id', { tag: ['@regression'] }, async ({ page, challengingDomPage }) => {
  await challengingDomPage.goto();
  const row = challengingDomPage.row('Iuvaret7');

  // Check the locator points at exactly one row, and the right one, before acting on it.
  await expect(row).toHaveCount(1);
  // nth() because a <td> has no id, class or link to its header. Column 6 is "Diceret".
  await expect(row.getByRole('cell').nth(5)).toHaveText('Phaedrum7');

  await challengingDomPage.editRow('Iuvaret7');
  await expect(page).toHaveURL(/#edit$/);
});

test('button ids change on every load, so tests must not use them', { tag: ['@regression'] }, async ({ page, challengingDomPage }) => {
  await challengingDomPage.goto();
  await expect(challengingDomPage.coloredButtons).toHaveCount(3);
  const idsBefore = await challengingDomPage.coloredButtons.evaluateAll((links) => links.map((a) => a.id));

  await page.reload({ waitUntil: 'domcontentloaded' }); // the assertion below waits for the links
  await expect(challengingDomPage.coloredButtons).toHaveCount(3);
  const idsAfter = await challengingDomPage.coloredButtons.evaluateAll((links) => links.map((a) => a.id));

  expect(idsAfter).not.toEqual(idsBefore);
});
