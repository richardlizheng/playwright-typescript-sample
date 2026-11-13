# Self-healing: Sloth-Python Analysis and TypeScript Port

This implementation is based on an analysis of the local `sloth-python/pytest_demo/self_healing/` code. It recovers locators using rules and DOM string similarity; it does not call an LLM or a remote AI service, and it does not require an API key. The Python project was not modified.

## Original Python Implementation

| File | Actual behavior |
|---|---|
| `locator_store.py` | Reads JSON files split by page, with support for the legacy `locators.json`; finds the file containing a key and updates its `primary` |
| `element_finder.py` | Tries id, CSS, XPath, and text in `primary → fallbacks` order; waits 1500 ms per strategy by default and returns `.first` |
| `dom_similarity.py` | Parses `page.content()` with BeautifulSoup/lxml, traverses all tags, and calculates similarity using `difflib.SequenceMatcher` |
| `self_healing.py` | Scans the DOM after normal location fails and generates a locator if the highest score reaches 0.45; writes it back to JSON immediately by default |
| `self_healing.py:click` | If a normal click fails, presses Escape and clicks again with `force=True` |

The Python scoring formula is:

```text
score = text × 0.35 + id × 0.25 + class × 0.15
      + name × 0.10 + aria-label × 0.10 + tag × 0.05
```

Strings are trimmed and lowercased first. A matching tag name scores 1; otherwise it scores 0. New locators are chosen in this order: `id → data-testid → name → first class → absolute XPath`. A successful ordinary fallback is not written back; only DOM similarity recovery is. The Robot call site explicitly sets `auto_update=False`, unlike the Python helper's default.

Identified risks:

- `SequenceMatcher('', '').ratio()` equals 1. If expected specifies only text/tag and a candidate also has no id/class/name/aria-label, those four fields contribute **0.60**, exceeding the 0.45 threshold even when the text is completely different.
- All tags compete, including hidden elements and parent containers; the top candidate is selected even when its score is close to the runner-up's.
- `.first` can hide the fact that a locator matches multiple elements, and selectors generated from classes are not guaranteed to be unique.
- A new locator is written back before the click succeeds; a forced click can bypass obstruction checks. Finding a similar element does not mean the business test is correct.
- Catching all exceptions and attempting recovery can treat syntax errors or browser closure as locator changes.

## TypeScript Version

| Python module | Corresponding file in this project |
|---|---|
| JSON structure | [`types.ts`](../utils/self-healing/types.ts), [`locators/`](../locators/) |
| locator_store | [`locator-store.ts`](../utils/self-healing/locator-store.ts) |
| element_finder / self_healing | [`self-healing.ts`](../utils/self-healing/self-healing.ts) |
| dom_similarity | [`dom-similarity.ts`](../utils/self-healing/dom-similarity.ts) |
| Write back to JSON | [`healing-reporter.ts`](../utils/self-healing/healing-reporter.ts), [`suggestions.ts`](../utils/self-healing/suggestions.ts), [`scripts/apply-healing.ts`](../scripts/apply-healing.ts) |
| Test integration | `selfHealing` and `selfHealingMode` in [`test-fixtures.ts`](../fixtures/test-fixtures.ts) |

The flow still tries the primary locator, fallback locators, and then a DOM similarity scan, but the following behaviors are deliberately different:

1. **Slow does not mean broken.** The primary and all fallbacks compete using `locator.or()` within a shared wait budget (5000 ms by default), and the first visible match in configuration order wins. Slow-rendering pages are given time to load, as with an ordinary locator; an existing fallback matches immediately instead of waiting for each preceding strategy to time out. The DOM is scanned only if the entire budget expires without a match.
2. **Preserve strict location.** Results are not selected with `.first()`; if the winning strategy matches multiple elements, it immediately raises a strict mode violation. Non-timeout errors such as invalid selectors and browser closure are rethrown unchanged.
3. **Specify expected features explicitly.** Similarity recovery requires an explicit `expected` with at least one non-tag feature. When only text is specified, it must match exactly after normalization: `Accept` and `Accepted` have a string similarity of 0.86, but they are different controls.
4. **Reduce false matches.** The six weights are unchanged, but only configured fields are scored and the result is normalized. When a tag is specified, it must match; candidates are first filtered by tag in the browser, and text is truncated to 200 characters. The defaults are `minScore=0.8` and a lead of at least `minMargin=0.1` over the runner-up. These are heuristic scores, not probabilities.
5. **Scan within a specified scope.** A Page or Locator is accepted; for example, passing a table row prevents recovery from finding an element in another row.
6. **Generate stable locators.** Candidates are prioritized as `data-test/data-testid → role + accessible name → name / aria-label → class combination → id`. IDs and classes that appear generated (consecutive digits, hex hashes, React `:r1:`, CSS Modules hashes) are excluded because they may work for this recovery but fail later. A new locator must be unique and visible within the scope, and `and()` must confirm that it points to the highest-scoring element, not merely a similar one. If no such locator can be found, recovery fails; no XPath is generated.
7. **Preserve click checks.** Escape is not pressed automatically and clicks are not forced; an obstructed or disabled element still causes failure. This is consistent with Playwright's [locator strictness](https://playwright.dev/docs/locators#strictness) and [actionability checks](https://playwright.dev/docs/actionability).
8. **Test processes never write files.** The fixture attaches recovery records to tests as `self-healing.json` attachments and adds annotations. At the end of the run, [`healing-reporter.ts`](../utils/self-healing/healing-reporter.ts) aggregates them into `reports/self-healing.json` and prints a summary. `npm run healing:apply` reads the aggregate: a DOM recovery becomes an update only when all runs agree; different choices by Chrome and Edge are reported as conflicts for a person to resolve; fallback matches only indicate that the primary has stopped working. The default is a dry run; add `-- --write` to modify JSON, then review the changes with git diff. With only one writer, file locks are no longer needed.
9. **Recovery cannot pass unnoticed.** The `SELF_HEALING` environment variable controls the mode:

   | Mode | Behavior | Use case |
   |---|---|---|
   | `off` | Uses only the primary, like an ordinary locator | Troubleshooting and proving that a test does not depend on recovery |
   | `report` (default) | Recovers and records; the test can pass normally | Local runs and the `main` branch |
   | `fail` | Continues execution and records after recovery; the fixture raises an error at the end of the test, causing it to fail | Pull requests |

   In `fail` mode, the test still runs to completion, business assertions are still checked, and suggestions are still written to the report, so one run provides the information needed for a fix. [GitHub Actions](../.github/workflows/playwright.yml) and [Azure Pipelines](../azure-pipelines.yml) use `fail` for PRs and `report` for `main`. An individual file can override this with `test.use({ selfHealingMode: 'report' })`, as [`recovery.spec.ts`](../tests/self-healing/recovery.spec.ts) does because it deliberately triggers recovery.

String similarity uses an algorithm that matches contiguous character blocks, preserving the core idea of SequenceMatcher. It also collapses consecutive whitespace and handles characters as Unicode code points, but does not implement Python's autojunk filtering of popular characters. It is therefore an adapted port and is not guaranteed to produce identical results to Python for every input.

## Scope: Demonstration Module, Outside Page Objects

This project favors stable locators and uses ESLint to prohibit fragile patterns. The role locator in `ChallengingDomPage.editRow()` is already sufficiently stable, so the page object keeps its native locator. Self-healing is called explicitly through the fixture only in [`tests/self-healing/`](../tests/self-healing/). This leaves existing test behavior unchanged and makes the module easier to evaluate independently.

## Usage

```ts
test('edit a row', async ({ challengingDomPage, selfHealing }) => {
  await challengingDomPage.goto();
  // Recovery is limited to this row
  await selfHealing.click(challengingDomPage.row('Iuvaret7'), 'challengingDom.edit');
});
```

The fixture loads all `*.json` files under [`locators/`](../locators/). To add a page, simply add a file; the same key cannot appear in two files. Files are cached by modification time and reloaded after edits.

```json
{
  "challengingDom.edit": {
    "primary": { "by": "role", "value": "link", "name": "edit" },
    "fallbacks": [{ "by": "css", "value": "a[href='#edit']" }],
    "expected": { "tag": "a", "text": "edit" }
  }
}
```

The Python formats for `primary`, `fallbacks`, `expected`, and `aria_label` are retained. Role, label, and testId strategies are added, and text now uses exact matching. `testId` uses Playwright's currently configured `data-test`. `expected.tag` must be a plain element name because it is used in a CSS selector.

To use it directly without the fixture:

```ts
const healing = new SelfHealing(LocatorStore.fromDir('locators'), {
  timeoutMs: 5000, // Shared wait budget for the primary and fallbacks
  minScore: 0.8,
  minMargin: 0.1,
  heal: true,      // false is equivalent to SELF_HEALING=off
});
const input = await healing.findElement(page, 'account.username');
await input.fill('example');
```

Process suggestions after a run:

```bash
npm run healing:apply                 # Dry run; reads reports/self-healing.json
npm run healing:apply -- --write      # Update locators/*.json, then review git diff
npm run healing:apply -- reports/healing/self-healing.json   # Aggregate from test:healing
```

In CI, the aggregate is in the `reports` artifact (`playwright-report` on GitHub, `reports-<attempt>` on Azure DevOps). Download it to the local `reports/` directory, then run the commands above.

## Verification

```bash
npm run typecheck
npm run lint
npm run test:healing
# Or run only Chrome:
npm run test:healing -- --project=chrome
npx playwright show-report playwright-report/healing
```

The standalone configuration [`playwright.healing.config.ts`](../playwright.healing.config.ts) runs local `page.setContent()` scenarios in installed Chrome and Edge browsers without `.env`, login, or an external site. The UI projects in the regular `npm test` run also include these tests.

Covered scenarios: primary locators, ordered fallbacks, slow-rendering primary, `heal: false`, `fail` mode, changed IDs and text, approximate text, random IDs, ambiguous candidates and score margins, low scores, hidden elements, disabled and obstructed elements, syntax errors, multiple matches, row-level scope, escaping special characters, directory loading and caching, invalid definitions, and suggestion merging and conflicts.

Limitations: This is not a global monkey patch; it applies only to operations that explicitly call the helper. The DOM scan is a single snapshot taken after the wait budget expires. It does not currently search across iframes or generate positional selectors for elements without stable attributes. Role inference covers only explicit `role`, buttons, and links with `href`; other elements fall back to attribute selectors. Recovery alone cannot prove that business behavior is correct, so existing assertions should be retained.
