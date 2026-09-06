import { describe, expect, it } from 'vitest';
import { canonicalPath, chunkIdFor, proxyPath } from '@/lib/streaming/cacheKeys';

describe('chunkIdFor', () => {
  it('is deterministic for the same origin + pathname', async () => {
    const first = await chunkIdFor('https://cdn.test/path/segment-1.ts?sig=aaa&exp=1');
    const second = await chunkIdFor('https://cdn.test/path/segment-1.ts?sig=bbb&exp=2');
    expect(first).toBe(second);
  });

  it('differs across distinct upstream paths', async () => {
    const first = await chunkIdFor('https://cdn.test/path/segment-1.ts');
    const second = await chunkIdFor('https://cdn.test/path/segment-2.ts');
    expect(first).not.toBe(second);
  });

  it('differs across distinct hosts even with the same path', async () => {
    const first = await chunkIdFor('https://cdn-a.test/path/segment-1.ts');
    const second = await chunkIdFor('https://cdn-b.test/path/segment-1.ts');
    expect(first).not.toBe(second);
  });
});

describe('canonicalPath / proxyPath', () => {
  it('builds the deterministic path that doubles as the cache key', () => {
    expect(canonicalPath('media1', 'providerA', 'variant1', 'binary', 'abc123')).toBe(
      'media1/providerA/variant1/binary/abc123',
    );
    expect(proxyPath({ mediaId: 'media1', providerId: 'providerA', variantId: 'variant1' }, 'binary', 'abc123')).toBe(
      '/api/proxy/media1/providerA/variant1/binary/abc123',
    );
  });

  it('never collides across different media/provider/variant for the same chunk id', () => {
    const a = proxyPath({ mediaId: 'media1', providerId: 'providerA', variantId: 'variant1' }, 'binary', 'abc123');
    const b = proxyPath({ mediaId: 'media2', providerId: 'providerA', variantId: 'variant1' }, 'binary', 'abc123');
    const c = proxyPath({ mediaId: 'media1', providerId: 'providerB', variantId: 'variant1' }, 'binary', 'abc123');
    expect(new Set([a, b, c]).size).toBe(3);
  });
});
