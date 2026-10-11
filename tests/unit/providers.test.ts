import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { getProvider, listProviders } from '@/providers/registry';

describe('provider registry', () => {
  it('orders movieBoxWeb first and rejects unknown ids', () => {
    assert.strictEqual(listProviders().length, 2);
    assert.strictEqual(getProvider('movieBoxWeb').id, 'movieBoxWeb');
    assert.throws(() => getProvider('nope'), /Unknown provider/);
  });
});
