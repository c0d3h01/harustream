import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearProxyIdentityCache,
  proxyStream,
  rewriteHlsManifest,
  srtToVtt,
  ttmlToVtt,
} from '@/lib/media/streamProxy';

const response = (status: number, body = 'media') =>
  new Response(body, {
    status,
    headers: { 'content-type': 'video/mp4' },
  });

afterEach(() => {
  clearProxyIdentityCache();
  vi.unstubAllGlobals();
});

describe('HLS manifest rewriting', () => {
  it('proxies URI attributes and bare relative and absolute resources', () => {
    const manifest = [
      '#EXTM3U',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",URI="audio/en.m3u8?token=a"',
      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",URI="../subs/en.vtt?sig=s"',
      '#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=1000,URI="iframes/low.m3u8"',
      '#EXT-X-STREAM-INF:BANDWIDTH=2000',
      'video/main.m3u8?token=v',
    ].join('\n');
    const rewritten = rewriteHlsManifest(
      manifest,
      'https://cdn.test/path/master.m3u8?manifest=signed',
      { referer: 'https://provider.test' },
    );
    expect(rewritten).toContain(
      'URI="/api/proxy?url=https%3A%2F%2Fcdn.test%2Fpath%2Faudio%2Fen.m3u8%3Ftoken%3Da&referer=https%3A%2F%2Fprovider.test"',
    );
    expect(rewritten).toContain(
      'URI="/api/proxy?url=https%3A%2F%2Fcdn.test%2Fsubs%2Fen.vtt%3Fsig%3Ds&referer=https%3A%2F%2Fprovider.test"',
    );
    expect(rewritten).toContain(
      'URI="/api/proxy?url=https%3A%2F%2Fcdn.test%2Fpath%2Fiframes%2Flow.m3u8&referer=https%3A%2F%2Fprovider.test"',
    );
    expect(rewritten).toContain(
      '/api/proxy?url=https%3A%2F%2Fcdn.test%2Fpath%2Fvideo%2Fmain.m3u8%3Ftoken%3Dv&referer=https%3A%2F%2Fprovider.test',
    );
  });

  it('rewrites encryption keys and initialization maps without changing other attributes', () => {
    const manifest = [
      '#EXTM3U',
      '#EXT-X-KEY:METHOD=AES-128,URI="https://keys.test/key.bin?sig=k",IV=0x1',
      '#EXT-X-MAP:URI="init.mp4?sig=i",BYTERANGE="720@0"',
      '#EXTINF:6,',
      'segment-1.ts?sig=x',
    ].join('\n');
    const rewritten = rewriteHlsManifest(manifest, 'https://cdn.test/video/index.m3u8');
    expect(rewritten).toContain('METHOD=AES-128');
    expect(rewritten).toContain('IV=0x1');
    expect(rewritten).toContain('BYTERANGE="720@0"');
    expect(rewritten.match(/\/api\/proxy\?/g)).toHaveLength(3);
    expect(rewritten).toContain('key.bin%3Fsig%3Dk');
    expect(rewritten).toContain('init.mp4%3Fsig%3Di');
    expect(rewritten).toContain('segment-1.ts%3Fsig%3Dx');
  });
});

describe('subtitle conversion', () => {
  it('converts TTML cues to browser-compatible VTT at the proxy boundary', () => {
    expect(
      ttmlToVtt(
        '<tt><body><p begin="00:00:01.000" end="00:00:02.500">Hello<br/>world &amp; more</p></body></tt>',
      ),
    ).toBe('WEBVTT\n\n00:00:01.000 --> 00:00:02.500\nHello\nworld & more\n');
  });

  it('converts SRT cues to browser-compatible VTT at the proxy boundary', () => {
    expect(srtToVtt('1\n00:00:01,000 --> 00:00:02,500\nHello\nworld')).toBe(
      'WEBVTT\n\n00:00:01.000 --> 00:00:02.500\nHello\nworld\n',
    );
  });
});

describe('upstream identity retry ladder', () => {
  it('uses provider headers without retrying when they succeed', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(200));
    vi.stubGlobal('fetch', fetchMock);

    await proxyStream('https://cdn-success.test/video.mp4', {
      headers: {
        userAgent: 'Test Browser',
        referer: 'https://provider.test',
        origin: 'https://provider.test',
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(new Headers(init?.headers).get('User-Agent')).toBe('Test Browser');
    expect(new Headers(init?.headers).get('Referer')).toBe('https://provider.test');
    expect(new Headers(init?.headers).get('Origin')).toBe('https://provider.test');
  });

  it('retries without referer and origin after an auth-shaped rejection', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(403))
      .mockResolvedValueOnce(response(200));
    vi.stubGlobal('fetch', fetchMock);

    await proxyStream('https://cdn-retry.test/video.mp4', {
      headers: {
        referer: 'https://themoviebox.org',
        origin: 'https://themoviebox.org',
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, retryInit] = fetchMock.mock.calls[1];
    const retryHeaders = new Headers(retryInit?.headers);
    expect(retryHeaders.get('User-Agent')).toContain('Mozilla/');
    expect(retryHeaders.has('Referer')).toBe(false);
    expect(retryHeaders.has('Origin')).toBe(false);
  });

  it('surfaces the original auth rejection when both variants fail', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(403))
      .mockResolvedValueOnce(response(426));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      proxyStream('https://cdn-both-fail.test/video.mp4', {
        headers: { referer: 'https://themoviebox.org' },
      }),
    ).rejects.toThrow('Upstream error (403)');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('remembers the successful variant for the upstream host', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(403))
      .mockResolvedValueOnce(response(200))
      .mockResolvedValueOnce(response(200));
    vi.stubGlobal('fetch', fetchMock);

    const url = 'https://cdn-cached.test/video.mp4';
    const options = { headers: { referer: 'https://themoviebox.org' } };
    await proxyStream(url, options);
    await proxyStream(url, options);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [, retryInit] = fetchMock.mock.calls[1];
    const [, cachedInit] = fetchMock.mock.calls[2];
    expect(new Headers(retryInit?.headers).has('Referer')).toBe(false);
    expect(new Headers(cachedInit?.headers).has('Referer')).toBe(false);
  });
});

describe('egress proxy forwarding', () => {
  const EGRESS = 'https://proxy-tunnel.test';

  it('routes upstream fetches through STREAM_EGRESS_PROXY_URL with identity as query params', async () => {
    vi.stubEnv('STREAM_EGRESS_PROXY_URL', `${EGRESS}/`);
    const fetchMock = vi.fn().mockResolvedValue(response(200));
    vi.stubGlobal('fetch', fetchMock);

    await proxyStream('https://cdn-egress.test/video.mp4', {
      headers: {
        referer: 'https://themoviebox.org',
        origin: 'https://themoviebox.org',
        cookie: 'sid=1',
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [fetchedUrl, init] = fetchMock.mock.calls[0];
    // Trailing slash on the env var must be normalized away.
    expect(fetchedUrl.startsWith(`${EGRESS}/api/proxy?url=`)).toBe(true);
    const params = new URL(fetchedUrl).searchParams;
    expect(params.get('url')).toBe('https://cdn-egress.test/video.mp4');
    expect(params.get('referer')).toBe('https://themoviebox.org');
    expect(params.get('origin')).toBe('https://themoviebox.org');
    expect(params.get('cookie')).toBe('sid=1');
    // Identity headers are carried as query params by the egress proxy; the
    // local request must not duplicate them.
    const headers = new Headers(init?.headers);
    expect(headers.has('Referer')).toBe(false);
    expect(headers.has('Cookie')).toBe(false);
  });

  it('sends a bare request to the egress hop when no identity is configured', async () => {
    vi.stubEnv('STREAM_EGRESS_PROXY_URL', EGRESS);
    const fetchMock = vi.fn().mockResolvedValue(response(200));
    vi.stubGlobal('fetch', fetchMock);

    await proxyStream('https://cdn-egress-bare.test/video.mp4');

    const [fetchedUrl] = fetchMock.mock.calls[0];
    expect(fetchedUrl).toBe(
      `${EGRESS}/api/proxy?url=${encodeURIComponent('https://cdn-egress-bare.test/video.mp4')}`,
    );
    const params = new URL(fetchedUrl).searchParams;
    expect(params.get('referer')).toBeNull();
    expect(params.get('origin')).toBeNull();
  });

  it('fetches directly when no egress proxy is configured (default behaviour)', async () => {
    vi.stubEnv('STREAM_EGRESS_PROXY_URL', '');
    const fetchMock = vi.fn().mockResolvedValue(response(200));
    vi.stubGlobal('fetch', fetchMock);

    await proxyStream('https://cdn-direct.test/video.mp4', {
      headers: { referer: 'https://themoviebox.org' },
    });

    const [fetchedUrl, init] = fetchMock.mock.calls[0];
    expect(fetchedUrl).toBe('https://cdn-direct.test/video.mp4');
    expect(new Headers(init?.headers).get('Referer')).toBe('https://themoviebox.org');
  });
});
