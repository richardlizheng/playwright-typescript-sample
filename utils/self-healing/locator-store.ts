import { readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { LocatorDefinition, Strategy } from './types';

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validStrategy(value: unknown): value is Strategy {
  return object(value) && typeof value.value === 'string' && value.value.trim() !== '' &&
    (['id', 'css', 'xpath', 'testId', 'label', 'text'].includes(String(value.by)) ||
      (value.by === 'role' && typeof value.name === 'string' && value.name.trim() !== ''));
}

// The tag goes into a CSS selector during the DOM scan, so it must be a plain element name.
function validFingerprint(value: unknown): boolean {
  return object(value) && Object.entries(value).every(([field, text]) =>
    ['tag', 'text', 'id', 'class', 'name', 'aria_label'].includes(field) && typeof text === 'string' &&
    (field !== 'tag' || /^[a-z][a-z0-9-]*$/i.test(text)));
}

function read(file: string): Record<string, LocatorDefinition> {
  const data: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (!object(data)) throw new Error(`Invalid locator store: ${file}`);
  for (const [key, entry] of Object.entries(data)) {
    if (!object(entry) || !validStrategy(entry.primary) ||
      (entry.fallbacks !== undefined && (!Array.isArray(entry.fallbacks) || !entry.fallbacks.every(validStrategy))) ||
      (entry.expected !== undefined && !validFingerprint(entry.expected))) {
      throw new Error(`Invalid locator definition: ${key} in ${file}`);
    }
  }
  return data as Record<string, LocatorDefinition>;
}

export class LocatorStore {
  readonly files: string[];
  // Parsed files keyed by path. A changed mtime means the file was edited and is read again.
  private readonly cache = new Map<string, { mtimeMs: number; data: Record<string, LocatorDefinition> }>();

  constructor(files: string[]) {
    if (!files.length) throw new Error('At least one locator file is required');
    this.files = [...new Set(files.map((file) => resolve(file)))];
  }

  // Every *.json file in a folder, so a new page needs a new file and no code change.
  static fromDir(dir: string): LocatorStore {
    return new LocatorStore(readdirSync(dir).filter((name) => name.endsWith('.json')).sort().map((name) => join(dir, name)));
  }

  private load(file: string) {
    const { mtimeMs } = statSync(file);
    const cached = this.cache.get(file);
    if (cached?.mtimeMs === mtimeMs) return cached.data;
    const data = read(file);
    this.cache.set(file, { mtimeMs, data });
    return data;
  }

  private entry(key: string) {
    let found: { file: string; definition: LocatorDefinition } | undefined;
    for (const file of this.files) {
      const data = this.load(file);
      if (!Object.hasOwn(data, key)) continue;
      if (found) throw new Error(`Duplicate locator key: ${key}`);
      found = { file, definition: data[key] };
    }
    if (!found) throw new Error(`Locator key not found: ${key}`);
    return found;
  }

  get(key: string): LocatorDefinition {
    return this.entry(key).definition;
  }

  // Relative to the working directory, so reports do not leak the machine's absolute paths.
  fileOf(key: string): string {
    return relative(process.cwd(), this.entry(key).file);
  }

  // Called by `npm run healing:apply` after the run, never by a test, so there is a single writer.
  updatePrimary(key: string, strategy: Strategy): void {
    if (!validStrategy(strategy)) throw new Error('Invalid replacement strategy');
    const { file } = this.entry(key);
    const data = read(file);
    data[key].primary = strategy;
    // Write a sibling file, then rename: a reader never sees half a JSON file.
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`, { flag: 'wx' });
      renameSync(temporary, file);
    } finally {
      rmSync(temporary, { force: true });
    }
    this.cache.delete(file);
  }
}
