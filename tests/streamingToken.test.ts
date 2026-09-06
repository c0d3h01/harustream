import { afterEach, describe, expect, it, vi } from 'vitest';
import { mintProxyToken, resetTokenKeyCache, verifyProxyToken } from '@/lib/streaming/token';

afterEach(() => {
  vi.unstubAllEnvs();
  resetTokenKeyCache();
});

describe('proxy token', () => {
  it('round-trips a target through mint and verify on the same path', async () => {
    const path = 'media1/providerA/variant1/binary/abc123';
    const { token, exp } = await mintProxyToken(
      { url: 'https://cdn.test/video.mp4', headers: { referer: 'https://provider.test' } },
      60_000,
      path,
    );
    const payload = await verifyProxyToken(token, path);
    expect(payload).toMatchObject({
      url: 'https://cdn.test/video.mp4',
      headers: { referer: 'https://provider.test' },
    });
    expect(payload?.exp).toBe(exp);
  });

  it('rejects a token replayed on a different path (path binding via AAD)', async () => {
    const mintedPath = 'media1/providerA/variant1/binary/abc123';
    const { token } = await mintProxyToken({ url: 'https://cdn.test/video.mp4' }, 60_000, mintedPath);
    const replayedPath = 'media2/providerA/variant1/binary/abc123';
    expect(await verifyProxyToken(token, replayedPath)).toBeNull();
  });

  it('rejects a tampered token', async () => {
    const path = 'media1/providerA/variant1/binary/abc123';
    const { token } = await mintProxyToken({ url: 'https://cdn.test/video.mp4' }, 60_000, path);
    const tampered = `${token.slice(0, -2)}${token.slice(-2) === 'AA' ? 'BB' : 'AA'}`;
    expect(await verifyProxyToken(tampered, path)).toBeNull();
  });

  it('rejects an expired token even though the ciphertext is intact', async () => {
    const path = 'media1/providerA/variant1/binary/abc123';
    const { token } = await mintProxyToken({ url: 'https://cdn.test/video.mp4' }, -1_000, path);
    expect(await verifyProxyToken(token, path)).toBeNull();
  });

  it('refuses to mint in production without STREAM_PROXY_SECRET', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('STREAM_PROXY_SECRET', '');
    resetTokenKeyCache();
    await expect(
      mintProxyToken({ url: 'https://cdn.test/video.mp4' }, 60_000, 'media1/providerA/variant1/binary/abc123'),
    ).rejects.toThrow(/STREAM_PROXY_SECRET/);
  });

  it('mints and verifies successfully once a secret is configured', async () => {
    vi.stubEnv('STREAM_PROXY_SECRET', 'unit-test-secret');
    resetTokenKeyCache();
    const path = 'media1/providerA/variant1/binary/abc123';
    const { token } = await mintProxyToken({ url: 'https://cdn.test/video.mp4' }, 60_000, path);
    expect(await verifyProxyToken(token, path)).toMatchObject({ url: 'https://cdn.test/video.mp4' });
  });
});
