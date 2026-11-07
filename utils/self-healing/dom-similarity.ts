import type { Locator } from '@playwright/test';
import type { Fingerprint, LocatorRoot, Strategy } from './types';

const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();

// Matching contiguous blocks, as in difflib.SequenceMatcher. No autojunk heuristic:
// locator attributes are short, and repeated characters still carry information.
export function similarity(left: string, right: string): number {
  const a = [...normalize(left)];
  const b = [...normalize(right)];
  if (!a.length || !b.length) return 0;
  const pending = [[0, a.length, 0, b.length]];
  let matches = 0;
  while (pending.length) {
    const [aStart, aEnd, bStart, bEnd] = pending.pop()!;
    let bestA = aStart, bestB = bStart, size = 0;
    let previous = new Map<number, number>();
    for (let i = aStart; i < aEnd; i++) {
      const current = new Map<number, number>();
      for (let j = bStart; j < bEnd; j++) {
        if (a[i] !== b[j]) continue;
        const length = (previous.get(j - 1) ?? 0) + 1;
        current.set(j, length);
        if (length > size) { bestA = i - length + 1; bestB = j - length + 1; size = length; }
      }
      previous = current;
    }
    if (!size) continue;
    matches += size;
    if (aStart < bestA && bStart < bestB) pending.push([aStart, bestA, bStart, bestB]);
    if (bestA + size < aEnd && bestB + size < bEnd) pending.push([bestA + size, aEnd, bestB + size, bEnd]);
  }
  return 2 * matches / (a.length + b.length);
}

const weights = { text: 0.35, id: 0.25, class: 0.15, name: 0.10, aria_label: 0.10, tag: 0.05 };

export function scoreFingerprint(actual: Fingerprint, expected: Fingerprint): number {
  if (expected.tag && normalize(actual.tag ?? '') !== normalize(expected.tag)) return 0;
  const fields = (Object.keys(weights) as (keyof Fingerprint)[]).filter((key) => expected[key]?.trim());
  const features = fields.filter((key) => key !== 'tag');
  if (!features.length) return 0;
  // Short labels that differ by one word score high: "Accept" vs "Accepted" is 0.86.
  // With text as the only evidence, a near miss is a different control, so require the same text.
  if (features.length === 1 && features[0] === 'text' && normalize(actual.text ?? '') !== normalize(expected.text!)) return 0;
  const total = fields.reduce((sum, key) => sum + weights[key], 0);
  return fields.reduce((sum, key) => sum + weights[key] * similarity(actual[key] ?? '', expected[key]!), 0) / total;
}

// Values that change between renders: digit runs, hex hashes, React useId (":r1:"), CSS-module hashes.
// Such a value would heal this run and break the next, so it never becomes a selector.
export const GENERATED = /\d{3,}|(?=[a-f]*\d)[0-9a-f]{6,}|^:|__[a-z0-9]{5,}$/i;

export type Candidate = {
  // The scanned element itself, used to prove a generated locator points at this element.
  element: Locator;
  fingerprint: Fingerprint;
  strategies: Strategy[];
  score: number;
};

export async function rankCandidates(root: LocatorRoot, expected: Fingerprint): Promise<Candidate[]> {
  // Filter by tag in the browser: only the elements that can score are sent back to Node.
  const scope = root.locator(`${expected.tag ?? '*'}:visible`);
  const scanned = await scope.evaluateAll((elements, generatedSource) => {
    const generated = new RegExp(generatedSource, 'i');
    return elements.map((element) => {
      const tag = element.localName;
      const attr = (name: string) => element.getAttribute(name) ?? '';
      // A long text belongs to a container, never to a control, so 200 characters are enough to compare.
      const text = ((element as HTMLElement).innerText ?? element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
      const role = attr('role') ||
        (tag === 'button' || (tag === 'input' && ['button', 'submit', 'reset'].includes(attr('type'))) ? 'button' : '') ||
        (tag === 'a' && element.hasAttribute('href') ? 'link' : '');
      const roleName = attr('aria-label') || text;
      const classes = [...element.classList].filter((name) => !generated.test(name));
      // Most stable first: testing contracts, then what the user sees, then markup details.
      const strategies = [
        ...['data-test', 'data-testid'].filter((name) => attr(name)).map((name) => ({ by: 'css', value: `${tag}[${name}="${CSS.escape(attr(name))}"]` })),
        ...(role && roleName && roleName.length <= 80 ? [{ by: 'role', value: role, name: roleName }] : []),
        ...['name', 'aria-label'].filter((name) => attr(name)).map((name) => ({ by: 'css', value: `${tag}[${name}="${CSS.escape(attr(name))}"]` })),
        ...(classes.length ? [{ by: 'css', value: `${tag}${classes.map((name) => `.${CSS.escape(name)}`).join('')}` }] : []),
        ...(attr('id') && !generated.test(attr('id')) ? [{ by: 'css', value: `${tag}[id="${CSS.escape(attr('id'))}"]` }] : []),
      ];
      return {
        fingerprint: { tag, text, id: attr('id'), class: attr('class'), name: attr('name'), aria_label: attr('aria-label') },
        strategies,
      };
    });
  }, GENERATED.source);
  return scanned.map((candidate, index) => ({
    element: scope.nth(index),
    fingerprint: candidate.fingerprint,
    strategies: candidate.strategies as Strategy[],
    score: scoreFingerprint(candidate.fingerprint, expected),
  })).sort((a, b) => b.score - a.score);
}
