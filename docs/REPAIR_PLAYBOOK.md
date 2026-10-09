# Repair playbook: fixing a large broken suite

The goal is a pipeline people trust again, as fast as possible. Fix causes, not single tests.

## 1. Measure once

Run the whole suite once, with no retries, and keep the JSON report.

```bash
npx playwright test --retries=0     # writes reports/results.json
```

## 2. Group failures by cause

```bash
npm run triage
```

[`scripts/triage-failures.ts`](../scripts/triage-failures.ts) reads the report, classifies each error message
with simple regex rules, and prints a count per category plus the top 5 files:

```
Failed results: 5

By category:
     2  Locator not found
     1  Strict mode (locator matches many)
     1  Assertion
     1  Environment / network
```

| Category | Usual cause | Usual fix |
|---|---|---|
| Locator not found (timeout) | The UI changed. Ids or CSS classes were renamed. | Update the page object. Move to role or label locators. |
| Strict mode (many matches) | The locator was too loose and the page gained a second match. | Scope it: `filter({ hasText })`, or a parent locator. |
| Assertion | The app's text or behaviour changed, or the app has a real bug. | Confirm with the team: a bug report or a test update. |
| Test data | Expired users, deleted records, data shared between tests. | Create data per test through the API (see [`booking.api.spec.ts`](../tests/api/booking.api.spec.ts)). |
| Environment / network | Wrong URL, missing env variable, service down. | Fix config once. It often clears a whole category. |
| Test timeout | A step was slow with no clearer error. Often an overloaded site or too many workers. | Check the trace for the slow step. Lower workers for shared environments. |

## 3. Fix shared code first

Page objects, fixtures and helpers are used by many tests. One fix in `LoginPage` can repair 50 tests.
Sort the top-5-files list by *shared code*, not by test file.

## 4. Replace brittle locators while you are there

Every locator you touch moves to the top of the [locator priority](LOCATORS.md):
role → label → text → test id. Remove fixed waits and `force: true` at the same time.
[`examples/before-after/`](../examples/before-after/) shows one test before and after.

## 5. Start with smoke and critical flows, quarantine the rest

Repair `@smoke` and the business-critical flows (login, checkout) first.
Tag tests that are still broken so the pipeline gives a clean signal:

```ts
test('report export', { tag: ['@quarantine'] }, async ({ page }) => { /* ... */ });
```

```bash
npx playwright test --grep-invert @quarantine   # the pipeline: must be green
npx playwright test --grep @quarantine          # the backlog: run and fix daily
```

Every quarantined test gets a ticket and an owner. Quarantine is a to-do list, not a bin.

## 6. Track the pass rate every day

One number in the team channel each morning: passed / total, and how many are in quarantine.
Both numbers should move the right way every day. When quarantine is empty, the repair is done.
