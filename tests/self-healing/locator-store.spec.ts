import { mkdirSync, readdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { relative } from 'node:path';
import { test, expect } from '@playwright/test';
import { LocatorStore } from '../../utils/self-healing/locator-store';
import { SelfHealing } from '../../utils/self-healing/self-healing';
import { GENERATED, similarity } from '../../utils/self-healing/dom-similarity';
import { planUpdates } from '../../utils/self-healing/suggestions';
import type { Strategy, Suggestion } from '../../utils/self-healing/types';

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
    // The tag is placed into a CSS selector, so anything but an element name is rejected.
    writeFileSync(file, JSON.stringify({ login: { primary: { by: 'id', value: 'x' }, expected: { tag: 'a, *' } } }));
    expect(() => new LocatorStore([file]).get('login')).toThrow(/Invalid locator definition/);
  });

  test('a folder store loads every JSON file and sees later edits', async ({}, testInfo) => {
    const dir = testInfo.outputPath('locators');
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/a.json`, JSON.stringify({ one: { primary: { by: 'id', value: 'one' } } }));
    writeFileSync(`${dir}/b.json`, JSON.stringify({ two: { primary: { by: 'id', value: 'two' } } }));
    writeFileSync(`${dir}/notes.txt`, 'ignored');
    const store = LocatorStore.fromDir(dir);
    expect(store.get('two').primary).toEqual({ by: 'id', value: 'two' });
    expect(store.fileOf('one')).toBe(relative(process.cwd(), `${dir}/a.json`));
    writeFileSync(`${dir}/b.json`, JSON.stringify({ two: { primary: { by: 'id', value: 'edited' } } }));
    utimesSync(`${dir}/b.json`, new Date(), new Date(Date.now() + 1000));
    expect(store.get('two').primary).toEqual({ by: 'id', value: 'edited' });
    store.updatePrimary('one', { by: 'testId', value: 'one' });
    expect(store.get('one').primary).toEqual({ by: 'testId', value: 'one' });
    // The atomic write leaves no temporary files behind.
    expect(readdirSync(dir).sort()).toEqual(['a.json', 'b.json', 'notes.txt']);
  });

  test('only agreed DOM recoveries become updates', async () => {
    const suggestion = (key: string, method: Suggestion['method'], replacement: Strategy): Suggestion => ({
      key, method, replacement, file: 'locators/x.json', original: { by: 'id', value: 'old' }, test: 't', project: 'chrome',
    });
    const role: Strategy = { by: 'role', value: 'button', name: 'Log in' };
    const plan = planUpdates([
      suggestion('agreed', 'similarity', role), suggestion('agreed', 'similarity', role),
      suggestion('disputed', 'similarity', role), suggestion('disputed', 'similarity', { by: 'css', value: 'button.login' }),
      suggestion('fallback', 'fallback', { by: 'text', value: 'Log in' }),
    ]);
    expect(plan.updates).toEqual([{ key: 'agreed', replacement: role, tests: 2 }]);
    expect(plan.conflicts.map((conflict) => conflict.key)).toEqual(['disputed']);
    expect(plan.fallbacks).toEqual([{ key: 'fallback', replacement: { by: 'text', value: 'Log in' } }]);
  });

  test('generated-looking ids and classes are recognised', async () => {
    for (const value of ['a8f3c2', 'user1234', ':r1:', 'Button_root__x8Ab3', '48f0e2b0-1c2d']) expect(value).toMatch(GENERATED);
    for (const value of ['login-action', 'row-edit', 'username', 'btn-2', 'accepted']) expect(value).not.toMatch(GENERATED);
  });

  test('matching-block similarity tolerates small edits and normalizes whitespace', async () => {
    expect(similarity('Log in', ' Log  in ')).toBe(1);
    expect(similarity('abcd', 'abxd')).toBe(0.75);
    expect(similarity('Log in', 'Log in now')).toBe(0.75);
    expect(similarity('abc', 'xyz')).toBe(0);
  });
});
