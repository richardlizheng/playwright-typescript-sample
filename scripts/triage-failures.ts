// Reads the JSON report and groups failures by likely cause, so the biggest problem gets fixed first.
// Usage: npx playwright test  (writes reports/results.json), then  npm run triage
import { existsSync, readFileSync } from 'node:fs';
import { stripVTControlCharacters } from 'node:util';

type Result = { status: string; errors?: { message?: string }[] };
type Spec = { file: string; title: string; tests: { results: Result[] }[] };
type Suite = { specs?: Spec[]; suites?: Suite[] };

const REPORT = process.argv[2] ?? 'reports/results.json';

// First match wins, so the most specific rules come first.
const RULES: [category: string, pattern: RegExp][] = [
  ['Strict mode (locator matches many)', /strict mode violation/i],
  ['Environment / network', /net::ERR|ECONNREFUSED|ENOTFOUND|socket hang up|Missing env variable|Site returned \d+|page\.goto: Timeout/i],
  // An action that timed out (locator.click: Timeout) or an expect on an element that is not there.
  ['Locator not found', /(locator|page)\.\w+: Timeout|element\(s\) not found/i],
  ['Test data', /test-data|Bad credentials|Cannot read properties of undefined/i],
  // The element was found, but its text, count or state was wrong.
  ['Assertion', /expect\(/i],
  // Nothing more specific: a step was simply too slow. Often a slow or overloaded site.
  ['Test timeout', /Test timeout of \d+ms exceeded/i],
];

function classify(message: string): string {
  const clean = stripVTControlCharacters(message); // remove terminal colours
  return RULES.find(([, pattern]) => pattern.test(clean))?.[0] ?? 'Other';
}

function* failedResults(suite: Suite): Generator<{ file: string; message: string }> {
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests) {
      for (const result of test.results) {
        if (result.status === 'failed' || result.status === 'timedOut') {
          // One result can hold several errors, e.g. "Test timeout" plus the real cause. Use them all.
          const messages = (result.errors ?? []).map((e) => e.message ?? '').join('\n');
          yield { file: spec.file, message: messages || result.status };
        }
      }
    }
  }
  for (const child of suite.suites ?? []) yield* failedResults(child);
}

if (!existsSync(REPORT)) {
  console.error(`No report at ${REPORT}. Run "npx playwright test" first.`);
  process.exit(1);
}

const report = JSON.parse(readFileSync(REPORT, 'utf8')) as { suites: Suite[] };
const byCategory = new Map<string, number>();
const byFile = new Map<string, number>();
let total = 0;

for (const suite of report.suites) {
  for (const { file, message } of failedResults(suite)) {
    total++;
    const category = classify(message);
    byCategory.set(category, (byCategory.get(category) ?? 0) + 1);
    byFile.set(file, (byFile.get(file) ?? 0) + 1);
  }
}

const sortDesc = (map: Map<string, number>) => [...map].sort((a, b) => b[1] - a[1]);

console.log(`Failed results: ${total}\n`);
console.log('By category:');
for (const [category, count] of sortDesc(byCategory)) console.log(`  ${String(count).padStart(4)}  ${category}`);
console.log('\nTop 5 files:');
for (const [file, count] of sortDesc(byFile).slice(0, 5)) console.log(`  ${String(count).padStart(4)}  ${file}`);
