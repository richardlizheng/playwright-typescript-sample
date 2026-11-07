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
  if (!fields.some((key) => key !== 'tag')) return 0;
  const total = fields.reduce((sum, key) => sum + weights[key], 0);
  return fields.reduce((sum, key) => sum + weights[key] * similarity(actual[key] ?? '', expected[key]!), 0) / total;
}

export async function rankCandidates(root: LocatorRoot, expected: Fingerprint) {
  const candidates = await root.locator('*:visible').evaluateAll((elements) => elements.map((element) => {
    const tag = element.localName;
    const attr = (name: string) => element.getAttribute(name) ?? '';
    const selectors: string[] = [];
    // Prefer testing contracts over ids, which may be random on each render.
    for (const attribute of ['data-test', 'data-testid', 'id', 'name', 'aria-label']) {
      if (attr(attribute)) selectors.push(`${tag}[${attribute}="${CSS.escape(attr(attribute))}"]`);
    }
    if (element.classList.length) selectors.push(`${tag}${[...element.classList].map((name) => `.${CSS.escape(name)}`).join('')}`);
    return {
      fingerprint: {
        tag, text: (element as HTMLElement).innerText ?? element.textContent ?? '',
        id: attr('id'), class: attr('class'), name: attr('name'), aria_label: attr('aria-label'),
      },
      selectors,
    };
  }));
  return candidates.map((candidate) => ({
    ...candidate,
    score: scoreFingerprint(candidate.fingerprint, expected),
    strategies: candidate.selectors.map((value): Strategy => ({ by: 'css', value })),
  })).sort((a, b) => b.score - a.score);
}
