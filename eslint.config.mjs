import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import playwright from 'eslint-plugin-playwright';

export default defineConfig(
  {
    ignores: ['node_modules/', 'playwright-report/', 'test-results/', 'reports/', '.auth/',
      // The "before" file breaks the rules on purpose. It is an example, not a test.
      'examples/before-after/before.spec.ts'],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['tests/**/*.ts', 'pages/**/*.ts', 'fixtures/**/*.ts', 'examples/**/*.ts'],
    ...playwright.configs['flat/recommended'],
    rules: {
      ...playwright.configs['flat/recommended'].rules,
      // These are the rules that matter most for flaky tests, so they fail the build.
      'playwright/no-wait-for-timeout': 'error',
      'playwright/expect-expect': ['warn', { assertFunctionNames: ['expectLoaded'] }],
      'playwright/no-force-option': 'error',
      'playwright/no-element-handle': 'error', // page.$ and page.$$
      'playwright/no-wait-for-selector': 'error',
      'playwright/prefer-web-first-assertions': 'error',
      'playwright/no-conditional-in-test': 'error',
      'playwright/valid-test-tags': ['error', { allowedTags: ['@smoke', '@regression', '@e2e', '@quarantine'] }],
      'no-restricted-syntax': ['error', {
        selector: 'Literal[value=/^(xpath=)?\\/html/]',
        message: 'Absolute XPath breaks on any layout change. Use a role, label or test id locator.',
      }],
    },
  },
);
