import { test, expect } from '../../fixtures/test-fixtures';

// A local page keeps this test fast and deterministic. Playwright's clock lets it
// check a 30-second timer without waiting 30 seconds.
//
// To inspect a real pop-up by hand before it disappears:
// open DevTools > Console and run  setTimeout(() => { debugger; }, 3000)
// then open the pop-up within 3 seconds. The page freezes and you can inspect it in Elements.
// Or open the pop-up and press F8 in the Sources tab to pause script execution.
test('toast shows, then hides after 30 seconds', { tag: ['@regression'] }, async ({ page }) => {
  await page.clock.install();
  await page.setContent(`
    <button onclick="show()">Save</button>
    <div id="toast" role="status" hidden>Saved</div>
    <script>
      function show() {
        const t = document.getElementById('toast');
        t.hidden = false;
        setTimeout(() => { t.hidden = true; }, 30000);
      }
    </script>`);

  await page.getByRole('button', { name: 'Save' }).click();
  const toast = page.getByRole('status');
  await expect(toast).toBeVisible();
  await expect(toast).toHaveText('Saved');

  await page.clock.fastForward('00:29');
  await expect(toast).toBeVisible(); // still there just before the deadline

  await page.clock.fastForward('00:02');
  await expect(toast).toBeHidden();
});
