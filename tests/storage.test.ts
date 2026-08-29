import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  librarySchema,
  progressSchema,
  readStorage,
  settingsSchema,
} from '@/lib/storage/schema';

function fakeStorage(value: string | null): Storage {
  return {
    getItem: () => value,
    setItem: () => undefined,
    removeItem: () => undefined,
    clear: () => undefined,
    key: () => null,
    length: 0,
  };
}

describe('versioned local storage', () => {
  it('returns defaults for corrupt payloads', () => {
    expect(readStorage('settings', settingsSchema, DEFAULT_SETTINGS, fakeStorage('{'))).toEqual(
      DEFAULT_SETTINGS,
    );
    expect(
      readStorage('library', librarySchema, { version: 1, items: [] }, fakeStorage('[]')),
    ).toEqual({
      version: 1,
      items: [],
    });
  });

  it('returns defaults for legacy payloads', () => {
    expect(
      readStorage(
        'progress',
        progressSchema,
        { version: 1, entries: {} },
        fakeStorage(JSON.stringify({ entries: {} })),
      ),
    ).toEqual({ version: 1, entries: {} });
    expect(
      readStorage(
        'settings',
        settingsSchema,
        DEFAULT_SETTINGS,
        fakeStorage(JSON.stringify({ ...DEFAULT_SETTINGS, version: 0 })),
      ),
    ).toEqual(DEFAULT_SETTINGS);
  });
});
