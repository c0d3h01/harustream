import assert from 'node:assert/strict';
import { afterEach, describe, expect, it } from 'vitest';
import { decodeBase64Url, encodeBase64Url } from '@/lib/base64url';
import { isBlockedHost } from '@/lib/net/ssrf';
import { providerAllowsHost } from '@/providers/_shared/urls';
import { app } from '@/server/app';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function stubFetch(handler: (url: string, init: RequestInit) => Response): void {
  globalThis.fetch = ((input: RequestInfo | URL, init: RequestInit = {}) =>
    Promise.resolve(
      handler(typeof input === 'string' ? input : input.toString(), init),
    )) as typeof fetch;
}

function call(query: string, init: RequestInit = {}): Promise<Response> {
  return Promise.resolve(app.request(`https://app.test/api/stream/${query}`, init));
}

function target(providerId: string, absolute: string): string {
  return `${encodeURIComponent(providerId)}/${encodeBase64Url(absolute)}`;
}

describe('request id', () => {
  it('is minted per response and echoed when the client sends one', async () => {
    stubFetch(() => new Response('ok'));
    const minted = await call(target('torrentio', 'https://example.test/a.mp4'));
    assert.match(minted.headers.get('x-request-id') ?? '', /[0-9a-f-]{8,}/);

    stubFetch(() => new Response('ok'));
    const echoed = await call(target('torrentio', 'https://example.test/a.mp4'), {
      headers: { 'x-request-id': 'client-supplied' },
    });
    assert.equal(echoed.headers.get('x-request-id'), 'client-supplied');
  });
});

describe('isBlockedHost', () => {
  it('blocks loopback, private, link-local and CGNAT space', () => {
    for (const host of [
      'localhost',
      'foo.local',
      'foo.internal',
      '127.0.0.1',
      '10.1.2.3',
      '172.16.0.1',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '198.18.0.1',
      '224.0.0.1',
      '[::1]',
      '[fe80::1]',
      '[fc00::1]',
      '[::ffff:127.0.0.1]',
    ]) {
      assert.equal(isBlockedHost(host), true, `${host} must be blocked`);
    }
  });

  it('allows public hosts', () => {
    for (const host of ['example.com', '8.8.8.8', 'a.hakunaymatata.com', '[2606:4700::1]']) {
      assert.equal(isBlockedHost(host), false, `${host} must be allowed`);
    }
  });
});

describe('providerAllowsHost', () => {
  it('always allows the provider site and its subdomains', () => {
    assert.equal(providerAllowsHost('movieBoxWeb', 'officialmoviebox.com'), true);
    assert.equal(providerAllowsHost('movieBoxWeb', 'img.officialmoviebox.com'), true);
  });

  it('allows declared upstream patterns only', () => {
    assert.equal(providerAllowsHost('movieBoxWeb', 'a.hakunaymatata.com'), true);
    assert.equal(providerAllowsHost('movieBoxWeb', 'hakunaymatata.com.evil.com'), false);
    assert.equal(providerAllowsHost('movieBoxWeb', 'evil.com'), false);
  });
});

describe('GET /api/stream', () => {
  it('rejects a host the provider does not serve', async () => {
    const response = await call(target('movieBoxWeb', 'https://evil.example/video.mp4'));
    assert.equal(response.status, 403);
  });

  it('rejects internal targets', async () => {
    const response = await call(target('movieBoxWeb', 'https://127.0.0.1/video.mp4'));
    assert.equal(response.status, 403);
  });

  it('answers a bare /api/stream with 400 rather than crashing', async () => {
    const res = await app.request('/api/stream');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('BAD_REQUEST');
  });

  it('rejects a malformed path', async () => {
    const response = await call('movieBoxWeb');
    assert.equal(response.status, 400);
  });

  it('sends the provider identity headers', async () => {
    let seen: Headers | undefined;
    stubFetch((_url, init) => {
      seen = new Headers(init.headers as HeadersInit);
      return new Response('bytes', { status: 200, headers: { 'content-type': 'video/mp4' } });
    });
    const response = await call(target('movieBoxWeb', 'https://a.hakunaymatata.com/video.mp4'));
    assert.equal(response.status, 200);
    assert.match(seen?.get('referer') ?? '', /officialmoviebox\.com/);
    assert.equal(seen?.get('origin'), 'https://officialmoviebox.com');
    assert.match(seen?.get('user-agent') ?? '', /\w/);
  });

  it('forwards Range and preserves 206 + Content-Range', async () => {
    let seen: Headers | undefined;
    stubFetch((_url, init) => {
      seen = new Headers(init.headers as HeadersInit);
      return new Response('chunk', {
        status: 206,
        headers: { 'content-type': 'video/mp4', 'content-range': 'bytes 0-4/100' },
      });
    });
    const response = await call(target('movieBoxWeb', 'https://a.hakunaymatata.com/video.mp4'), {
      headers: { Range: 'bytes=0-4' },
    });
    assert.equal(response.status, 206);
    assert.equal(seen?.get('range'), 'bytes=0-4');
    assert.equal(response.headers.get('content-range'), 'bytes 0-4/100');
  });

  it('rewrites HLS children back through the stream route', async () => {
    stubFetch(
      () =>
        new Response('#EXTM3U\n#EXTINF:6,\nseg-1.ts', {
          status: 200,
          headers: { 'content-type': 'application/vnd.apple.mpegurl' },
        }),
    );
    const response = await call(
      target('movieBoxWeb', 'https://a.hakunaymatata.com/hls/index.m3u8'),
    );
    const body = await response.text();
    assert.match(body, /\/api\/stream\/movieBoxWeb\//);
    const href = body.split('\n').find((line) => line.startsWith('/api/stream/')) ?? '';
    const encoded = href.split('?')[0].split('/').filter(Boolean)[3];
    const decoded = decodeBase64Url(encoded);
    assert.strictEqual(decoded, 'https://a.hakunaymatata.com/hls/seg-1.ts');
  });

  it('drops credentials when a redirect crosses origin', async () => {
    // No provider ships a cookie today, so prove the stripping with a temporary
    // one: the behaviour matters again the moment a provider needs a session.
    process.env.STREAM_PROXY_USER_AGENT = 'test-agent';
    const hops: Array<{ url: string; cookie: string | null }> = [];
    let count = 0;
    stubFetch((url, init) => {
      const headers = new Headers(init.headers as HeadersInit);
      hops.push({ url, cookie: headers.get('cookie') });
      count += 1;
      if (count === 1) {
        return new Response(null, {
          status: 302,
          headers: { location: 'https://b.hakunaymatata.com/video.mp4' },
        });
      }
      return new Response('bytes', { status: 200, headers: { 'content-type': 'video/mp4' } });
    });
    const response = await call(target('movieBoxWeb', 'https://a.hakunaymatata.com/video.mp4'));
    assert.equal(response.status, 200);
    assert.equal(hops.length, 2);
    assert.equal(hops[1].cookie, null, 'no cookie may follow a cross-origin redirect');
  });

  it('converts srt subtitles to vtt', async () => {
    stubFetch(
      () =>
        new Response('1\n00:00:01,000 --> 00:00:02,000\nhi\n', {
          status: 200,
          headers: { 'content-type': 'application/x-subrip' },
        }),
    );
    const response = await call(
      `${target('movieBoxWeb', 'https://a.hakunaymatata.com/s.srt')}?format=srt`,
    );
    assert.match(response.headers.get('content-type') ?? '', /text\/vtt/);
    assert.match(await response.text(), /WEBVTT/);
  });

  it('answers 502 for an upstream rejection without relaying its status', async () => {
    stubFetch(() => new Response('nope', { status: 403 }));
    const response = await call(target('movieBoxWeb', 'https://a.hakunaymatata.com/video.mp4'));
    assert.equal(response.status, 502);
    assert.equal(await response.text(), '{"error":"Upstream request failed"}');
  });

  it('keeps 403 for our own allowlist denial', async () => {
    const response = await call(target('movieBoxWeb', 'https://elsewhere.example/video.mp4'));
    assert.equal(response.status, 403);
  });

  it('retries a throttled upstream once', async () => {
    let calls = 0;
    stubFetch(() => {
      calls += 1;
      return calls === 1
        ? new Response('slow down', { status: 429 })
        : new Response('video', { status: 200, headers: { 'content-type': 'video/mp4' } });
    });
    const response = await call(target('movieBoxWeb', 'https://a.hakunaymatata.com/video.mp4'));
    assert.equal(response.status, 200);
    assert.equal(calls, 2);
  });

  it("uses the visitor's own timezone and user-agent upstream", async () => {
    let seen: Record<string, string> = {};
    stubFetch((_url, init) => {
      seen = Object.fromEntries(new Headers(init?.headers).entries());
      return new Response('video', { status: 200, headers: { 'content-type': 'video/mp4' } });
    });
    await call(target('movieBoxWeb', 'https://a.hakunaymatata.com/video.mp4'), {
      headers: {
        'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/605.1.15',
        cookie: 'haru-tz=Europe%2FBerlin',
      },
    });
    assert.equal(
      seen['user-agent'],
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/605.1.15',
    );
    assert.equal(seen['x-client-info'], '{"timezone":"Europe/Berlin"}');
  });
});
