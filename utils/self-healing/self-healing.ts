import { errors, type Locator } from '@playwright/test';
import { rankCandidates } from './dom-similarity';
import { LocatorStore } from './locator-store';
import type { LocatorRoot, RecoveryEvent, Strategy } from './types';

function cssString(value: string): string {
  const escaped = [...value].map((character) => {
    const code = character.codePointAt(0)!;
    return character === '"' || character === '\\' || code < 32 || code === 127
      ? `\\${code.toString(16)} ` : character;
  }).join('');
  return `"${escaped}"`;
}

export function buildLocator(root: LocatorRoot, strategy: Strategy): Locator {
  switch (strategy.by) {
    case 'id': return root.locator(`[id=${cssString(strategy.value)}]`);
    case 'css': return root.locator(`css=${strategy.value}`);
    case 'xpath': return root.locator(`xpath=${strategy.value}`);
    case 'text': return root.getByText(strategy.value, { exact: true });
    case 'label': return root.getByLabel(strategy.value, { exact: true });
    case 'testId': return root.getByTestId(strategy.value);
    case 'role': return root.getByRole(strategy.value, { name: strategy.name, exact: true });
    default: throw new Error(`Unsupported locator strategy: ${JSON.stringify(strategy)}`);
  }
}

type Options = {
  timeoutMs?: number;
  minScore?: number;
  minMargin?: number;
  autoUpdate?: boolean;
  onRecovery?: (event: RecoveryEvent) => void;
};

type Resolution = { locator: Locator; event?: RecoveryEvent };

export class SelfHealing {
  private readonly options: Required<Options>;

  constructor(private readonly store: LocatorStore, options: Options = {}) {
    this.options = {
      timeoutMs: 1500, minScore: 0.8, minMargin: 0.1, autoUpdate: false,
      onRecovery: (event) => console.warn('[self-healing]', JSON.stringify(event)),
      ...options,
    };
    const { timeoutMs, minScore, minMargin } = this.options;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 ||
      !Number.isFinite(minScore) || minScore <= 0 || minScore > 1 ||
      !Number.isFinite(minMargin) || minMargin <= 0 || minMargin > 1) {
      throw new Error('Invalid self-healing timeout, score or margin');
    }
  }

  private async resolve(root: LocatorRoot, key: string): Promise<Resolution> {
    const definition = this.store.get(key);
    const strategies = [definition.primary, ...(definition.fallbacks ?? [])];
    let lastError: unknown;
    for (const [index, strategy] of strategies.entries()) {
      const locator = buildLocator(root, strategy);
      try {
        // Strict mode errors, invalid selectors and closed pages propagate unchanged.
        await locator.waitFor({ state: 'visible', timeout: this.options.timeoutMs });
        return { locator, event: index ? {
          key, method: 'fallback', original: definition.primary, replacement: strategy,
        } : undefined };
      } catch (error) {
        if (!(error instanceof errors.TimeoutError)) throw error;
        lastError = error;
      }
    }

    // An explicit fingerprint is required; a CSS expression is not element text.
    const candidates = await rankCandidates(root, definition.expected ?? {});
    const [best, runnerUp] = candidates;
    if (!best || best.score < this.options.minScore ||
      (runnerUp && best.score - runnerUp.score < this.options.minMargin)) {
      throw new Error(`Self-healing refused for ${key}: missing, weak or ambiguous match (best=${best?.score.toFixed(3) ?? 'none'})`, { cause: lastError });
    }
    for (const replacement of best.strategies) {
      const locator = buildLocator(root, replacement);
      if (await locator.count() !== 1 || !await locator.isVisible()) continue;
      return { locator, event: { key, method: 'similarity', original: definition.primary, replacement, score: best.score } };
    }
    throw new Error(`Self-healing refused for ${key}: no unique attribute selector`, { cause: lastError });
  }

  private report(event?: RecoveryEvent) {
    if (event) this.options.onRecovery(event);
  }

  async findElement(root: LocatorRoot, key: string): Promise<Locator> {
    const result = await this.resolve(root, key);
    this.report(result.event);
    // Finding an element alone does not prove an interaction works; never persist here.
    return result.locator;
  }

  async click(root: LocatorRoot, key: string, timeoutMs = 8000): Promise<void> {
    const result = await this.resolve(root, key);
    this.report(result.event);
    // Preserve Playwright's actionability checks. An overlay is not a broken locator.
    await result.locator.click({ timeout: timeoutMs });
    if (this.options.autoUpdate && result.event?.method === 'similarity') {
      this.store.updatePrimary(key, result.event.replacement);
    }
  }
}
