import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import type { RecoveryEvent, Suggestion } from './types';

// Collects the self-healing.json attachment of every test into one file for review,
// and prints a summary. Test workers never write locator files themselves.
export default class HealingReporter implements Reporter {
  private readonly suggestions: Suggestion[] = [];

  constructor(private readonly options: { outputFile?: string } = {}) {}

  onTestEnd(test: TestCase, result: TestResult) {
    const attachment = result.attachments.find((item) => item.name === 'self-healing.json' && item.body);
    if (!attachment?.body) return;
    const events = JSON.parse(attachment.body.toString('utf8')) as RecoveryEvent[];
    const title = test.titlePath().filter(Boolean).join(' › ');
    for (const event of events) this.suggestions.push({ ...event, test: title, project: test.parent.project()?.name ?? '' });
  }

  onEnd() {
    const file = this.options.outputFile ?? 'reports/self-healing.json';
    mkdirSync(dirname(file), { recursive: true });
    // Always written, so a stale file from an earlier run is never mistaken for this one.
    writeFileSync(file, `${JSON.stringify(this.suggestions, null, 2)}\n`);
    if (!this.suggestions.length) return;
    const keys = new Set(this.suggestions.map((suggestion) => suggestion.key));
    console.log(`\nSelf-healing: ${this.suggestions.length} recoveries for ${keys.size} locator key(s), saved to ${file}`);
    for (const key of keys) {
      const methods = new Set(this.suggestions.filter((suggestion) => suggestion.key === key).map((suggestion) => suggestion.method));
      console.log(`  ${key}: ${[...methods].join(', ')}`);
    }
    console.log('Review with: npm run healing:apply  (add -- --write to update locators/)');
  }

  printsToStdio() {
    return false;
  }
}
