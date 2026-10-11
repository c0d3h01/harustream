import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { parseLibrary, parseSettings } from '@/lib/storage/schema';

describe('parseLibrary', () => {
  it('rejects garbage and version mismatch', () => {
    assert.strictEqual(parseLibrary(null), null);
    assert.strictEqual(parseLibrary({ version: 999, items: [] }), null);
    assert.strictEqual(parseLibrary({ version: 1, items: [{ id: 7 }] }), null);
  });
  it('accepts a minimal valid payload', () => {
    const item = {
      id: 'a',
      providerId: 'p',
      providerName: 'P',
      title: 'T',
      displayTitle: 'T',
      ref: 'r',
    };
    assert.deepStrictEqual(parseLibrary({ version: 1, items: [item] })?.items, [item]);
  });
});

describe('parseSettings', () => {
  it('rejects non-boolean autoAdvance', () => {
    assert.strictEqual(parseSettings({ version: 1, autoAdvance: 'yes' }), null);
  });
});
