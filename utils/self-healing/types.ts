import type { Locator, Page } from '@playwright/test';

export type LocatorRoot = Page | Locator;
export type Strategy =
  | { by: 'id' | 'css' | 'xpath' | 'testId' | 'label' | 'text'; value: string }
  | { by: 'role'; value: Parameters<Page['getByRole']>[0]; name: string };

// Keep the Python JSON field names so existing locator definitions can be imported.
export type Fingerprint = Partial<Record<'tag' | 'text' | 'id' | 'class' | 'name' | 'aria_label', string>>;
export type LocatorDefinition = {
  primary: Strategy;
  fallbacks?: Strategy[];
  expected?: Fingerprint;
};

// off: primary only, like a plain locator. report: heal and record. fail: heal, record, then fail the test.
export const HEALING_MODES = ['off', 'report', 'fail'] as const;
export type HealingMode = typeof HEALING_MODES[number];

export type RecoveryEvent = {
  key: string;
  // The locator JSON that owns the key, relative to the working directory.
  file: string;
  method: 'fallback' | 'similarity';
  original: Strategy;
  replacement: Strategy;
  score?: number;
};

// One line of reports/self-healing.json, written by the reporter and read by `npm run healing:apply`.
export type Suggestion = RecoveryEvent & { test: string; project: string };
