import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/proxy/[...stream]/route';
import { canonicalPath, chunkIdFor, proxyPath } from '@/lib/streaming/cacheKeys';
import { mintProxyToken } from '@/lib/streaming/token';

const VARIANT = { mediaId: 'media1', providerId: 'providerA', variantId: 'variant1' };

async function mintedUrl(
  kind: 'manifest' | 'binary' | 'subtitle',
  upstreamUrl: string,
  ttlMs = 60_000,
): Promise<string> {
  const chunkId = await chunkIdFor(upstreamUrl);
  const path = canonicalPath(VARIANT.mediaId, VARIANT.providerId, VARIANT.variantId, kind, chunkId);
  const { token, exp } = await mintProxyToken({ url: upstreamUrl }, ttlMs, path);
  return `http://app.test${proxyPath(VARIANT, kind, chunkId)}?exp=${exp}&token=${encodeURIComponent(token)}`;
}

function callRoute(url: string, init?: RequestInit) {
  const request = new Request(url, init);
  const stream = new URL(url).pathname.replace(/^\/api\/proxy\//, '').split('/');
  return GET(request, { params: Promise.resolve({ stream }) });
}

const upstreamResponse = (status: number, body = 'media-bytes', headers: Record<string, string> = {}) =>
  new Response(body, { status, headers: { 'content-type': 'video/mp4', ...headers } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GET /api/proxy/[...stream]', () => {
  it('rejects a malformed path before any crypto or network work', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await callRoute('http://app.test/api/proxy/only-one-segment');
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an expired token via the cheap cleartext check, before decrypting', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const url = await mintedUrl('binary', 'https://cdn.test/video.mp4', -60_000);
    const response = await callRoute(url);
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a tampered token', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const url = await mintedUrl('binary', 'https://cdn.test/video.mp4');
    const tampered = url.replace(/token=([^&]+)/, (_match, token: string) => `token=${token.slice(0, -4)}zzzz`);
    const response = await callRoute(tampered);
    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a token minted for a different variant path (path binding)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const url = await mintedUrl('binary', 'https://cdn.test/video.mp4');
    const wrongMedia = url.replace('/media1/', '/media2/');
    const response = await callRoute(wrongMedia);
    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('streams a binary chunk through with Range passthrough and long immutable caching', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      upstreamResponse(206, 'chunk-bytes', {
        'content-range': 'bytes 0-99/1000',
        'content-length': '100',
        'accept-ranges': 'bytes',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const url = await mintedUrl('binary', 'https://cdn.test/segment-1.ts');
    const response = await callRoute(url, { headers: { Range: 'bytes=0-99' } });

    expect(response.status).toBe(206);
    expect(response.headers.get('cache-control')).toBe('public, max-age=21600, immutable');
    expect(response.headers.get('content-range')).toBe('bytes 0-99/1000');
    const [, init] = fetchMock.mock.calls[0];
    expect(new Headers(init?.headers).get('Range')).toBe('bytes=0-99');
  });

  it('rewrites a manifest and marks it privately cacheable', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        upstreamResponse(200, '#EXTM3U\nsegment-1.ts', { 'content-type': 'application/vnd.apple.mpegurl' }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const url = await mintedUrl('manifest', 'https://cdn.test/index.m3u8');
    const response = await callRoute(url);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, max-age=4');
    const body = await response.text();
    expect(body).toContain('/api/proxy/media1/providerA/variant1/binary/');
  });

  it('surfaces the upstream status when both header identity variants are rejected', async () => {
    const fetchMock = vi.fn().mockResolvedValue(upstreamResponse(403));
    vi.stubGlobal('fetch', fetchMock);
    const url = await mintedUrl('binary', 'https://cdn.test/video.mp4');
    const response = await callRoute(url);
    expect(response.status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
