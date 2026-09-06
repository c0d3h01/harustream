import { describe, expect, it } from 'vitest';
import { TtlCache } from '@/lib/cache';

describe('TtlCache', () => {
  it('keeps shared work alive when one caller aborts', async () => {
    const cache = new TtlCache<string>();
    const controller = new AbortController();
    let resolve!: (value: string) => void;
    const work = new Promise<string>((done) => {
      resolve = done;
    });

    const aborted = cache.getOrSet('key', 1_000, () => work, controller.signal);
    const active = cache.getOrSet('key', 1_000, () => Promise.resolve('unexpected'));
    controller.abort();
    resolve('cached');

    await expect(aborted).rejects.toMatchObject({ name: 'AbortError' });
    await expect(active).resolves.toBe('cached');
    expect(cache.get('key')).toBe('cached');
  });
});
