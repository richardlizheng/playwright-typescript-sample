# Locators: how I choose them and how I verify them

## Priority

Use the first one that works. Go down the list only when the one above is not possible.

| # | Locator | Why | Example in this repo |
|---|---|---|---|
| 1 | `getByRole(role, { name })` | Matches what a user and a screen reader see. Survives most markup changes. | `getByRole('button', { name: 'Login' })` in [LoginPage](../pages/sauce/LoginPage.ts) |
| 2 | `getByLabel(text)` | Form fields with a label or `aria-label`. | `getByLabel('Password')` in [LoginPage](../pages/sauce/LoginPage.ts) |
| 3 | `getByText` / `getByPlaceholder` | Visible text that is not a control. | `getByText('Hello World!')` in [DynamicLoadingPage](../pages/internet/DynamicLoadingPage.ts) |
| 4 | `getByTestId(id)` | A stable hook added for tests. This repo sets `testIdAttribute: 'data-test'`. | `getByTestId('inventory-item')` in [InventoryPage](../pages/sauce/InventoryPage.ts) |
| 5 | CSS | Only when there is no role, label, text or test id. | `[data-test^="add-to-cart-"]`, `a.button` |
| 6 | XPath | Last resort. Never absolute (`/html/body/...`). | none |

`nth()`, `first()` and `last()` are allowed only with a comment that says why position is the only option.
See the `nth(5)` example in [locators.spec.ts](../tests/internet/locators.spec.ts).

## Two common mistakes

- **Role is the ARIA role, not the HTML tag.** An `<a href>` is `link`, not `a`. An `<input type="submit">` is `button`.
  On The Internet's Challenging DOM page, the coloured "buttons" are `<a>` tags, so their role is `link`.
- **The option is `name`, not `text`.** `getByRole('button', { name: 'Add to cart' })`.
  `name` is the accessible name. It matches a substring by default. Add `exact: true` when that matters.

## Patterns used here

**Find an item in a list, then the button inside it.** No index, no product-specific id:

```ts
page.getByTestId('inventory-item')
  .filter({ hasText: 'Sauce Labs Backpack' })
  .getByRole('button', { name: 'Add to cart' });
```

**Find a table row by its text.** The Challenging DOM page changes its button ids and labels on every load.
So the test picks the row by the exact text of a cell, then the `edit` link inside it:

```ts
page.getByRole('row')
  .filter({ has: page.getByRole('cell', { name: 'Iuvaret7', exact: true }) })
  .getByRole('link', { name: 'edit' });
```

**CSS "starts with" for a value with a changing suffix.** `add-to-cart-sauce-labs-backpack`,
`add-to-cart-sauce-labs-onesie`, and so on. The prefix is stable:

```ts
page.locator('[data-test^="add-to-cart-"]');
```

## How to verify a locator

1. **DevTools → Elements → Accessibility tab.** Select the element. Read the *computed* role and name.
   These are exactly what `getByRole(role, { name })` matches.
2. **`npx playwright codegen <url>`** → click *Pick locator* → hover the element. Playwright suggests the best locator.
3. **`npx playwright test --ui`** → *Pick locator*, replay step by step, and inspect the DOM snapshot for each step.
4. **`PWDEBUG=console npx playwright test`** → in the browser console run
   `playwright.$('role=button[name="Login"]')` or `playwright.locator('...')` to see what matches.
5. **Strictness.** If a locator matches 2 or more elements, any action on it fails with a *strict mode violation*.
   That is a feature. Make the locator more specific (filter by text, scope to a parent). Do not reach for `first()`.

A quick check inside a test: `await expect(locator).toHaveCount(1)` before you act on it.
[locators.spec.ts](../tests/internet/locators.spec.ts) does this.

## Not allowed in `tests/` or `pages/`

| Pattern | Why | Enforced by |
|---|---|---|
| `waitForTimeout(...)` | Too slow when the app is fast, too short when it is slow. | `playwright/no-wait-for-timeout` |
| `{ force: true }` | Skips the checks that catch real bugs (hidden, covered, disabled). | `playwright/no-force-option` |
| `page.$` / `page.$$` | Element handles do not auto-wait or retry. | `playwright/no-element-handle` |
| Absolute XPath | Breaks on any layout change. | `no-restricted-syntax` rule in [eslint.config.mjs](../eslint.config.mjs) |

`npm run lint` fails the build on any of these.
