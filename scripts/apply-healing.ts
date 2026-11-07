// Turns the self-healing suggestions of the last run into locator JSON changes.
// Usage: npm run healing:apply             (dry run: prints what would change)
//        npm run healing:apply -- --write  (updates locators/*.json; review the git diff)
import { existsSync, readFileSync } from 'node:fs';
import { LocatorStore } from '../utils/self-healing/locator-store.ts';
import { planUpdates } from '../utils/self-healing/suggestions.ts';
import type { Suggestion } from '../utils/self-healing/types.ts';

const write = process.argv.includes('--write');
const REPORT = process.argv.slice(2).find((arg) => !arg.startsWith('--')) ?? 'reports/self-healing.json';

if (!existsSync(REPORT)) {
  console.error(`No suggestions at ${REPORT}. Run the tests first.`);
  process.exit(1);
}

const plan = planUpdates(JSON.parse(readFileSync(REPORT, 'utf8')) as Suggestion[]);
const store = LocatorStore.fromDir('locators');
const show = (value: unknown) => JSON.stringify(value);

if (!plan.updates.length && !plan.conflicts.length && !plan.fallbacks.length) console.log('No self-healing suggestions.');

for (const { key, replacement, tests } of plan.updates) {
  console.log(`${write ? 'Updated' : 'Would update'} ${key} in ${store.fileOf(key)} (${tests} recoveries)`);
  console.log(`  - ${show(store.get(key).primary)}\n  + ${show(replacement)}`);
  if (write) store.updatePrimary(key, replacement);
}
for (const { key, replacements } of plan.conflicts) {
  console.log(`Skipped ${key}: runs disagree, choose one by hand:`);
  for (const replacement of replacements) console.log(`  ? ${show(replacement)}`);
}
for (const { key, replacement } of plan.fallbacks) {
  console.log(`Primary of ${key} is broken; fallback ${show(replacement)} worked. Consider promoting it.`);
}
