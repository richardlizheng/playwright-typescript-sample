import { errors, type Locator } from '@playwright/test';
import { rankCandidates } from './dom-similarity';
import { LocatorStore } from './locator-store';
import { HEALING_MODES, type HealingMode, type LocatorRoot, type RecoveryEvent, type Strategy } from './types';

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
  // One wait budget shared by the primary and all fallbacks, which race each other.
  timeoutMs?: number;
  minScore?: number;
  minMargin?: number;
  // false: the primary locator only, exactly like a plain Playwright locator.
  heal?: boolean;
  onRecovery?: (event: RecoveryEvent) => void;
};

type Resolution = { locator: Locator; event?: RecoveryEvent };

export function healingMode(value = 'report'): HealingMode {
  if (!(HEALING_MODES as readonly string[]).includes(value)) {
    throw new Error(`SELF_HEALING must be one of ${HEALING_MODES.join(', ')}, not "${value}"`);
  }
  return value as HealingMode;
}

export class SelfHealing {
  private readonly options: Required<Options>;

  constructor(private readonly store: LocatorStore, options: Options = {}) {
    this.options = {
      timeoutMs: 5000, minScore: 0.8, minMargin: 0.1, heal: true,
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
    const strategies = [definition.primary, ...(this.options.heal ? definition.fallbacks ?? [] : [])];
    const locators = strategies.map((strategy) => buildLocator(root, strategy));
    const event = (method: RecoveryEvent['method'], replacement: Strategy, score?: number): RecoveryEvent =>
      ({ key, file: this.store.fileOf(key), method, original: definition.primary, replacement, ...(score === undefined ? {} : { score }) });
    let lastError: unknown;
    try {
      // Race all strategies in one budget. A slow page waits as long as a plain locator would,
      // so "not rendered yet" is never mistaken for "locator broken".
      // Invalid selectors and closed pages are not timeouts, so they propagate unchanged.
      await locators.reduce((union, locator) => union.or(locator)).filter({ visible: true }).first()
        .waitFor({ timeout: this.options.timeoutMs });
      for (const [index, locator] of locators.entries()) {
        // isVisible() is strict: a strategy that matches several elements fails here, as a click would.
        if (!await locator.count() || !await locator.isVisible()) continue;
        return { locator, event: index ? event('fallback', strategies[index]) : undefined };
      }
    } catch (error) {
      if (!(error instanceof errors.TimeoutError)) throw error;
      lastError = error;
    }
    if (!this.options.heal) throw lastError;

    // An explicit fingerprint is required; a CSS expression is not element text.
    const candidates = await rankCandidates(root, definition.expected ?? {});
    const [best, runnerUp] = candidates;
    if (!best || best.score < this.options.minScore ||
      (runnerUp && best.score - runnerUp.score < this.options.minMargin)) {
      throw new Error(`Self-healing refused for ${key}: missing, weak or ambiguous match (best=${best?.score.toFixed(3) ?? 'none'})`, { cause: lastError });
    }
    for (const replacement of best.strategies) {
      const locator = buildLocator(root, replacement);
      // Unique, visible, and the very element that scored: not merely one that looks like it.
      if (await locator.count() !== 1 || !await locator.isVisible() || await best.element.and(locator).count() !== 1) continue;
      return { locator, event: event('similarity', replacement, best.score) };
    }
    throw new Error(`Self-healing refused for ${key}: no unique, stable selector`, { cause: lastError });
  }

  private report(event?: RecoveryEvent) {
    if (event) this.options.onRecovery(event);
  }

  async findElement(root: LocatorRoot, key: string): Promise<Locator> {
    const result = await this.resolve(root, key);
    this.report(result.event);
    return result.locator;
  }

  async click(root: LocatorRoot, key: string, timeoutMs = 8000): Promise<void> {
    const result = await this.resolve(root, key);
    this.report(result.event);
    // Preserve Playwright's actionability checks. An overlay is not a broken locator.
    // Nothing is written here: suggestions go to the report and `npm run healing:apply`.
    await result.locator.click({ timeout: timeoutMs });
  }
}
