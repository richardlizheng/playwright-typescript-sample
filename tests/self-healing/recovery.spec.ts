import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { TestInfo } from '@playwright/test';
import { test, expect } from '../../fixtures/test-fixtures';
import { LocatorStore } from '../../utils/self-healing/locator-store';
import { buildLocator, SelfHealing } from '../../utils/self-healing/self-healing';
import { scoreFingerprint, similarity } from '../../utils/self-healing/dom-similarity';
import type { LocatorDefinition, RecoveryEvent, Strategy } from '../../utils/self-healing/types';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('self-healing recovery', { tag: '@regression' }, () => {

  const definition: LocatorDefinition = {
    primary: { by: 'id', value: 'old-login' },
    expected: { tag: 'button', text: 'Log in', class: 'login-action' },
  };

  function setup(testInfo: TestInfo, entry = definition, autoUpdate = false) {
    const file = testInfo.outputPath('locators.json');
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ login: entry }));
    const store = new LocatorStore([file]);
    const events: RecoveryEvent[] = [];
    const healing = new SelfHealing(store, {
      timeoutMs: 100, autoUpdate, onRecovery: (event) => events.push(event),
    });
    return { file, store, events, healing };
  }

  const loginHtml = '<button id="new-login" class="login-action" onclick="document.querySelector(\'output\').textContent = \'done\'">Log in</button><output></output>';

  test('primary locator succeeds without a recovery event', async ({ page }, testInfo) => {
    const { healing, events } = setup(testInfo, { primary: { by: 'text', value: 'Log in' } });
    await page.setContent(loginHtml);
    await healing.click(page, 'login');
    await expect(page.locator('output')).toHaveText('done');
    expect(events).toEqual([]);
  });

  test('fallbacks run in order and do not rewrite the store', async ({ page }, testInfo) => {
    const { healing, events, store } = setup(testInfo, {
      ...definition, fallbacks: [{ by: 'css', value: '#missing' }, { by: 'text', value: 'Log in' }],
    }, true);
    await page.setContent(loginHtml);
    await healing.click(page, 'login');
    await expect(page.locator('output')).toHaveText('done');
    expect(events).toMatchObject([{ method: 'fallback', replacement: { by: 'text', value: 'Log in' } }]);
    expect(store.get('login').primary).toEqual(definition.primary);
  });

  test('DOM similarity recovers a changed id and defaults to read-only', async ({ page }, testInfo) => {
    const { healing, events, file } = setup(testInfo);
    const before = readFileSync(file, 'utf8');
    await page.setContent(loginHtml);
    await healing.click(page, 'login');
    await expect(page.locator('output')).toHaveText('done');
    expect(events).toMatchObject([{ method: 'similarity', score: 1 }]);
    expect(readFileSync(file, 'utf8')).toBe(before);
  });

  test('opt-in persistence happens after a successful click and is reused', async ({ page }, testInfo) => {
    const { healing, events, store } = setup(testInfo, definition, true);
    await page.setContent(loginHtml);
    await healing.click(page, 'login');
    expect(store.get('login').primary).toEqual({ by: 'css', value: 'button[id="new-login"]' });
    await healing.click(page, 'login');
    expect(events).toHaveLength(1);
    await expect(page.locator('output')).toHaveText('done');
  });

  test('finding alone never persists a suggestion', async ({ page }, testInfo) => {
    const { healing, store } = setup(testInfo, definition, true);
    await page.setContent(loginHtml);
    await expect(await healing.findElement(page, 'login')).toHaveAttribute('id', 'new-login');
    expect(store.get('login').primary).toEqual(definition.primary);
  });

  test('disabled candidate fails the action and cannot rewrite JSON', async ({ page }, testInfo) => {
    const { healing, store } = setup(testInfo, definition, true);
    await page.setContent('<button id="new-login" class="login-action" disabled>Log in</button>');
    await expect(healing.click(page, 'login', 150)).rejects.toThrow(/Timeout/);
    expect(store.get('login').primary).toEqual(definition.primary);
  });

  test('an overlay is not bypassed by a forced click', async ({ page }, testInfo) => {
    const { healing, store } = setup(testInfo, definition, true);
    await page.setContent(`${loginHtml}<div style="position:fixed;inset:0;background:white;z-index:100"></div>`);
    await expect(healing.click(page, 'login', 150)).rejects.toThrow(/Timeout/);
    await expect(page.locator('output')).toBeEmpty();
    expect(store.get('login').primary).toEqual(definition.primary);
  });

  test('equally plausible candidates are rejected', async ({ page }, testInfo) => {
    const { healing, events } = setup(testInfo);
    await page.setContent('<button id="one" class="login-action">Log in</button><button id="two" class="login-action">Log in</button>');
    await expect(healing.findElement(page, 'login')).rejects.toThrow(/ambiguous/);
    expect(events).toEqual([]);
  });

  test('a small text change can recover above the score threshold', async ({ page }, testInfo) => {
    const { healing, events } = setup(testInfo);
    await page.setContent(loginHtml.replace('>Log in<', '>Log in!<'));
    await healing.click(page, 'login');
    await expect(page.locator('output')).toHaveText('done');
    expect(events[0].score).toBeGreaterThan(0.8);
    expect(events[0].score).toBeLessThan(1);
  });

  test('close but unequal scores still require a clear winning margin', async ({ page }, testInfo) => {
    const { healing } = setup(testInfo);
    await page.setContent(`${loginHtml}<button id="other" class="login-action">Log in!</button>`);
    await expect(healing.findElement(page, 'login')).rejects.toThrow(/ambiguous/);
  });

  test('unrelated elements cannot pass through empty-attribute matches', async ({ page }, testInfo) => {
    const { healing } = setup(testInfo, { primary: definition.primary, expected: { tag: 'button', text: 'Log in' } });
    await page.setContent('<button id="delete">Delete everything</button>');
    await expect(healing.findElement(page, 'login')).rejects.toThrow(/weak or ambiguous/);
    expect(scoreFingerprint({ tag: 'button' }, { tag: 'button' })).toBe(0);
    expect(similarity('', '')).toBe(0);
  });

  test('hidden candidates do not compete with the visible target', async ({ page }, testInfo) => {
    const { healing } = setup(testInfo);
    await page.setContent(`${loginHtml}<button id="hidden" class="login-action" hidden>Log in</button>`);
    await expect(await healing.findElement(page, 'login')).toHaveAttribute('id', 'new-login');
  });

  test('missing expected fingerprint refuses DOM recovery', async ({ page }, testInfo) => {
    const { healing } = setup(testInfo, { primary: definition.primary });
    await page.setContent(loginHtml);
    await expect(healing.findElement(page, 'login')).rejects.toThrow(/Self-healing refused/);
  });

  test('strict mode errors are not healed by choosing the first match', async ({ page }, testInfo) => {
    const { healing } = setup(testInfo, { ...definition, primary: { by: 'text', value: 'Log in' } });
    await page.setContent('<button>Log in</button><button>Log in</button>');
    await expect(healing.findElement(page, 'login')).rejects.toThrow(/strict mode violation/);
  });

  test('invalid CSS propagates instead of being treated as a missing element', async ({ page }, testInfo) => {
    const { healing, events } = setup(testInfo, { ...definition, primary: { by: 'css', value: '[' } });
    await page.setContent(loginHtml);
    await expect(healing.findElement(page, 'login')).rejects.toThrow(/Unexpected token|InvalidSelector|not a valid selector/);
    expect(events).toEqual([]);
  });

  test('DOM recovery refuses an element without a unique attribute selector', async ({ page }, testInfo) => {
    const { healing } = setup(testInfo, { primary: definition.primary, expected: { tag: 'button', text: 'Log in' } });
    await page.setContent('<button>Log in</button>');
    await expect(healing.findElement(page, 'login')).rejects.toThrow(/no unique attribute selector/);
  });

  test('page object fallback is limited to the selected table row', async ({ page, challengingDomPage }, testInfo) => {
    await page.setContent(`<table>
      <tr><td>Iuvaret1</td><td><a href="#edit">edit</a></td></tr>
      <tr><td>Iuvaret7</td><td><a href="#edit" onclick="document.querySelector('output').textContent='row7'">Edit row</a></td></tr>
    </table><output></output>`);
    await challengingDomPage.editRow('Iuvaret7');
    await expect(page.locator('output')).toHaveText('row7');
    expect(testInfo.annotations).toContainEqual({ type: 'self-healing', description: 'challengingDom.edit: fallback' });
  });

  test('missing row cannot recover to another row', async ({ page, challengingDomPage }) => {
    await page.setContent('<table><tr><td>Iuvaret1</td><td><a href="#edit">edit</a></td></tr></table>');
    await expect(challengingDomPage.editRow('Iuvaret7')).rejects.toThrow(/Self-healing refused/);
  });

  test('page object DOM recovery stays inside the selected row', async ({ page, challengingDomPage }, testInfo) => {
    await page.setContent(`<table>
      <tr><td>Iuvaret1</td><td><a class="row-edit">edit</a></td></tr>
      <tr><td>Iuvaret7</td><td><a class="row-edit" onclick="document.querySelector('output').textContent='row7'">edit</a></td></tr>
    </table><output></output>`);
    await challengingDomPage.editRow('Iuvaret7');
    await expect(page.locator('output')).toHaveText('row7');
    expect(testInfo.annotations).toContainEqual({ type: 'self-healing', description: 'challengingDom.edit: similarity' });
  });

  test('supported strategies and special characters resolve exactly', async ({ page }) => {
    await page.setContent('<label>Username<input name="username" data-test="username"></label><button>Log in</button>');
    await page.locator('input').evaluate((input) => { input.id = 'user:"\\name'; });
    const strategies: Strategy[] = [
      { by: 'id', value: 'user:"\\name' }, { by: 'css', value: 'input[name="username"]' },
      { by: 'xpath', value: '//input[@name="username"]' }, { by: 'label', value: 'Username' },
      { by: 'testId', value: 'username' },
    ];
    for (const strategy of strategies) await expect(buildLocator(page, strategy)).toHaveAttribute('name', 'username');
    await expect(buildLocator(page, { by: 'role', value: 'button', name: 'Log in' })).toHaveCount(1);
  });

  test('healed CSS escapes punctuation in generated selectors', async ({ page }, testInfo) => {
    const { healing } = setup(testInfo);
    await page.setContent(loginHtml);
    await page.locator('button').evaluate((button) => { button.id = 'login:"\\new'; });
    await healing.click(page, 'login');
    await expect(page.locator('output')).toHaveText('done');
  });
});
