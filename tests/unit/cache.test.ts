import assert from 'node:assert/strict';
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
    assert.strictEqual(await active, 'cached');
    assert.strictEqual(cache.get('key'), 'cached');
  });

  it('refetches after the TTL expires', async () => {
    const cache = new TtlCache<string>();
    let calls = 0;
    const factory = () => {
      calls += 1;
      return Promise.resolve(`value-${calls}`);
    };

    assert.strictEqual(await cache.getOrSet('key', 20, factory), 'value-1');
    assert.strictEqual(cache.get('key'), 'value-1');
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.strictEqual(cache.get('key'), undefined);
    assert.strictEqual(await cache.getOrSet('key', 20, factory), 'value-2');
    assert.strictEqual(calls, 2);
  });

  it('dedupes concurrent getOrSet calls to one factory call', async () => {
    const cache = new TtlCache<string>();
    let calls = 0;
    let resolve!: (value: string) => void;
    const work = new Promise<string>((done) => {
      resolve = done;
    });
    const first = cache.getOrSet('key', 1_000, () => {
      calls += 1;
      return work;
    });
    const second = cache.getOrSet('key', 1_000, () => {
      calls += 1;
      return Promise.resolve('unexpected');
    });
    resolve('shared');
    assert.strictEqual(await first, 'shared');
    assert.strictEqual(await second, 'shared');
    assert.strictEqual(calls, 1);
    assert.strictEqual(cache.get('key'), 'shared');
  });
});
