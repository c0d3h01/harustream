import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'vitest';
import { encodeBase64Url } from '@/lib/base64url';
import { app } from '@/server/app';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function stubFetch(handler: (url: string) => Response): void {
  globalThis.fetch = ((input: RequestInfo | URL) =>
    Promise.resolve(handler(typeof input === 'string' ? input : input.toString()))) as typeof fetch;
}

async function call(segment: string): Promise<Response> {
  return app.request(`/api/image/${encodeURIComponent(segment)}`);
}

describe('image proxy', () => {
  it('rejects a segment that is not a decodable url', async () => {
    for (const segment of ['not-base64!', '', encodeBase64Url('not a url'), 'x/y']) {
      const response = await call(segment);
      assert.equal(response.status, 400, `${segment} must be rejected`);
    }
  });

  it('rejects non-http, credentialed and internal targets', async () => {
    for (const raw of [
      'file:///etc/passwd',
      'https://user:pass@cdn.example.com/a.jpg',
      'http://169.254.169.254/latest/meta-data',
      'http://127.0.0.1:8080/a.jpg',
    ]) {
      const response = await call(encodeBase64Url(raw));
      assert.equal(response.status, 400, `${raw} must be rejected`);
    }
  });

  it('serves the upstream body with cache headers', async () => {
    stubFetch(
      () =>
        new Response('bytes', {
          headers: { 'content-type': 'image/webp', etag: 'W/"1"' },
        }),
    );
    const response = await call(encodeBase64Url('https://cdn.example.com/a.webp'));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/webp');
    assert.match(response.headers.get('cache-control') ?? '', /max-age=86400/);
  });

  it('re-checks the host on every redirect hop', async () => {
    stubFetch((url) =>
      url.includes('cdn.example.com')
        ? new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/' } })
        : new Response('nope', { status: 404 }),
    );
    const response = await call(encodeBase64Url('https://cdn.example.com/a.webp'));
    assert.equal(response.status, 502, 'a redirect into link-local must not be followed');
  });
});
