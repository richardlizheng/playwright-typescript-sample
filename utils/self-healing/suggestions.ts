import type { Strategy, Suggestion } from './types';

export type Plan = {
  // Every run that healed this key agreed on one replacement.
  updates: { key: string; replacement: Strategy; tests: number }[];
  // Runs disagreed (for example Chrome and Edge chose differently): a person decides.
  conflicts: { key: string; replacements: Strategy[] }[];
  // A fallback worked, so the primary is broken, but no new selector was generated.
  fallbacks: { key: string; replacement: Strategy }[];
};

// Pure, so it is tested without files. Only DOM recoveries become updates: a fallback is
// already in the JSON, and promoting it is a decision for code review.
export function planUpdates(suggestions: Suggestion[]): Plan {
  const plan: Plan = { updates: [], conflicts: [], fallbacks: [] };
  const byKey = new Map<string, Suggestion[]>();
  for (const suggestion of suggestions) byKey.set(suggestion.key, [...byKey.get(suggestion.key) ?? [], suggestion]);
  for (const [key, items] of byKey) {
    const healed = items.filter((item) => item.method === 'similarity');
    const distinct = [...new Map(healed.map((item) => [JSON.stringify(item.replacement), item.replacement])).values()];
    if (distinct.length === 1) plan.updates.push({ key, replacement: distinct[0], tests: healed.length });
    else if (distinct.length > 1) plan.conflicts.push({ key, replacements: distinct });
    else plan.fallbacks.push({ key, replacement: items[0].replacement });
  }
  return plan;
}
