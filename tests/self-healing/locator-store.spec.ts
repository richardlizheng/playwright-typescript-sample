import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { LocatorStore } from '../../utils/self-healing/locator-store';
import { SelfHealing } from '../../utils/self-healing/self-healing';
import { similarity } from '../../utils/self-healing/dom-similarity';

test.describe('locator store', { tag: '@regression' }, () => {

  test('split stores update only the owning file and retain metadata', async ({}, testInfo) => {
    mkdirSync(testInfo.outputDir, { recursive: true });
    const first = testInfo.outputPath('signin.json');
    const second = testInfo.outputPath('signup.json');
    const fallbacks = [{ by: 'text', value: 'Log in' }];
    writeFileSync(first, JSON.stringify({ login: { primary: { by: 'id', value: 'old' }, fallbacks, expected: { text: 'Log in' } } }));
    writeFileSync(second, JSON.stringify({ signup: { primary: { by: 'id', value: 'signup' } } }));
    const unchanged = readFileSync(second, 'utf8');
    const store = new LocatorStore([first, second]);
    store.updatePrimary('login', { by: 'id', value: 'new' });
    expect(store.get('login')).toEqual({ primary: { by: 'id', value: 'new' }, fallbacks, expected: { text: 'Log in' } });
    expect(readFileSync(second, 'utf8')).toBe(unchanged);
    expect(() => store.get('missing')).toThrow(/not found/);
    expect(() => store.updatePrimary('missing', { by: 'id', value: 'new' })).toThrow(/not found/);
    writeFileSync(second, readFileSync(first));
    expect(() => store.get('login')).toThrow(/Duplicate locator key/);
  });

  test('malformed definitions fail at the JSON boundary', async ({}, testInfo) => {
    mkdirSync(testInfo.outputDir, { recursive: true });
    const file = testInfo.outputPath('invalid.json');
    writeFileSync(file, JSON.stringify({ login: { primary: { by: 'magic', value: 'login' } } }));
    expect(() => new LocatorStore([file]).get('login')).toThrow(/Invalid locator definition/);
    expect(() => new SelfHealing(new LocatorStore([file]), { timeoutMs: 0 })).toThrow(/Invalid self-healing/);
  });

  test('an existing writer lock prevents lost updates', async ({}, testInfo) => {
    mkdirSync(testInfo.outputDir, { recursive: true });
    const file = testInfo.outputPath('locked.json');
    const original = JSON.stringify({ login: { primary: { by: 'id', value: 'old' } } });
    writeFileSync(file, original);
    writeFileSync(`${file}.lock`, '');
    expect(() => new LocatorStore([file]).updatePrimary('login', { by: 'id', value: 'new' })).toThrow(/EEXIST/);
    expect(readFileSync(file, 'utf8')).toBe(original);
  });

  test('matching-block similarity tolerates small edits and normalizes whitespace', async () => {
    expect(similarity('Log in', ' Log  in ')).toBe(1);
    expect(similarity('abcd', 'abxd')).toBe(0.75);
    expect(similarity('Log in', 'Log in now')).toBe(0.75);
    expect(similarity('abc', 'xyz')).toBe(0);
  });
});
