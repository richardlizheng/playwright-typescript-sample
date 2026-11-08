import { defineConfig } from 'allure';

// Allure 3: a Node.js CLI, no Java needed. Results come from the allure-playwright reporter.
export default defineConfig({
  name: 'Playwright TypeScript Sample',
  output: './allure-report',
  // Earlier runs, for trend charts and flaky / new-failure markers.
  // Kept between CI runs by a cache; locally it grows with every generated report.
  historyPath: './allure-history/history.jsonl',
  historyLimit: 20,
  plugins: {
    awesome: {
      options: {
        reportLanguage: 'en',
        // One HTML file: opens straight from a downloaded CI artifact, no web server needed.
        singleFile: true,
        groupBy: ['parentSuite', 'suite', 'subSuite'],
      },
    },
  },
});
