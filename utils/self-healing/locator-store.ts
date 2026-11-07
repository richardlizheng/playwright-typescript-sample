import { closeSync, openSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

function read(file: string): Record<string, LocatorDefinition> {
  const data: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (!object(data)) throw new Error(`Invalid locator store: ${file}`);
  for (const [key, entry] of Object.entries(data)) {
    if (!object(entry) || !validStrategy(entry.primary) ||
      (entry.fallbacks !== undefined && (!Array.isArray(entry.fallbacks) || !entry.fallbacks.every(validStrategy))) ||
      (entry.expected !== undefined && (!object(entry.expected) ||
        !Object.entries(entry.expected).every(([field, value]) =>
          ['tag', 'text', 'id', 'class', 'name', 'aria_label'].includes(field) && typeof value === 'string')))) {
      throw new Error(`Invalid locator definition: ${key} in ${file}`);
    }
  }
  return data as Record<string, LocatorDefinition>;
}

export class LocatorStore {
  readonly files: string[];

  constructor(files: string[]) {
    if (!files.length) throw new Error('At least one locator file is required');
    this.files = [...new Set(files.map((file) => resolve(file)))];
  }

  private entries() {
    const entries = new Map<string, { file: string; definition: LocatorDefinition }>();
    for (const file of this.files) {
      for (const [key, definition] of Object.entries(read(file))) {
        if (entries.has(key)) throw new Error(`Duplicate locator key: ${key}`);
        entries.set(key, { file, definition });
      }
    }
    return entries;
  }

  get(key: string): LocatorDefinition {
    const entry = this.entries().get(key);
    if (!entry) throw new Error(`Locator key not found: ${key}`);
    return entry.definition;
  }

  updatePrimary(key: string, strategy: Strategy): void {
    if (!validStrategy(strategy)) throw new Error('Invalid replacement strategy');
    const entry = this.entries().get(key);
    if (!entry) throw new Error(`Locator key not found: ${key}`);
    // Fail explicitly on concurrent writers instead of losing another worker's update.
    const lock = `${entry.file}.lock`;
    const descriptor = openSync(lock, 'wx');
    const temporary = `${entry.file}.${randomUUID()}.tmp`;
    try {
      const data = read(entry.file);
      if (!Object.hasOwn(data, key)) throw new Error(`Locator key not found: ${key}`);
      data[key].primary = strategy;
      writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`, { flag: 'wx' });
      renameSync(temporary, entry.file);
    } finally {
      try {
        rmSync(temporary, { force: true });
      } finally {
        closeSync(descriptor);
        unlinkSync(lock);
      }
    }
  }
}
