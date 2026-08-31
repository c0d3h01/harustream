import { describe, expect, it } from 'vitest';
import { createProviderContext } from '@/providers/_shared';

describe('provider context persistence', () => {
  it('persists a provider store while isolating provider namespaces', async () => {
    const first = createProviderContext('context-test-a');
    const second = createProviderContext('context-test-a');
    const other = createProviderContext('context-test-b');

    await first.kvStore.set('token', 'persisted');

    expect(second).toBe(first);
    expect(await second.kvStore.get('token')).toBe('persisted');
    expect(await other.kvStore.get('token')).toBeUndefined();
  });
});
