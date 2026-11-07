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
export type RecoveryEvent = {
  key: string;
  method: 'fallback' | 'similarity';
  original: Strategy;
  replacement: Strategy;
  score?: number;
};
