import type { Page } from '@playwright/test';

// Open a page and fail at once if the server is down (5xx, for example a 503 while a
// free-tier host restarts). Without this, the test would wait 30 seconds for a locator
// and the failure would look like a locator problem instead of a site problem.
// Only 5xx counts: Sauce Demo is a single-page app, and its deep links such as
// /inventory.html return 404 even though the app then renders the page correctly.
//
// It waits for 'domcontentloaded', not 'load'. The assertions that follow already wait for
// what the test needs; waiting for every image and frame only adds a way to time out.
export async function openPage(page: Page, url: string) {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
  if (response && response.status() >= 500) {
    throw new Error(`Site returned ${response.status()} for ${response.url()}. The site is down, not the test.`);
  }
}
