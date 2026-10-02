import { type Context, Hono } from 'hono';
import { decodeBase64Url } from '@/lib/base64url';
import type { ErrorCode } from '@/lib/errors';
import { scopeLogger } from '@/lib/log';
import { assertPublicUrl } from '@/lib/net/ssrf';
import { USER_AGENT } from '@/providers/_shared/headers';
import type { Variables } from '../requestId';

const MAX_REDIRECTS = 5;

/** Accepts an absolute http(s) URL on a public host. Nothing else. */
function safeUrl(raw: string): URL | undefined {
  try {
    const url = new URL(raw);
    assertPublicUrl(url);
    return url;
  } catch {
    return undefined;
  }
}

export const imageRouter = new Hono<{ Variables: Variables }>();

// Missing segment is a bad request too: `/api/image/` carries no decodable target.
// Hono's strict mode keeps `/image` and `/image/` distinct, so both are registered.
const missingSegment = (c: Context<{ Variables: Variables }>) =>
  c.json(
    { error: 'Invalid url parameter', code: 'BAD_REQUEST', requestId: c.get('requestId') },
    400,
  );
imageRouter.get('/image', missingSegment);
imageRouter.get('/image/', missingSegment);

imageRouter.get('/image/:encoded', async (c) => {
  const log = scopeLogger('api', { route: '/api/image' });
  const requestId = c.get('requestId');
  const started = Date.now();
  const encoded = c.req.param('encoded');
  // Failure bodies keep the route's exact safe messages; onError would swap them for the
  // generic errorMeta text, so these are built here instead of thrown as AppError.
  const fail = (status: 400 | 502, error: string, code: ErrorCode) =>
    c.json({ error, code, requestId }, status);

  let first: URL | undefined;
  try {
    first = safeUrl(decodeBase64Url(encoded));
  } catch {
    first = undefined;
  }
  if (!first) {
    log.warn({ requestId, host: encoded }, 'image target rejected');
    return fail(400, 'Invalid url parameter', 'BAD_REQUEST');
  }

  // Redirects are followed by hand: Cloudflare fetches resolve them for us, so
  // every hop has to pass the same host check as the first one.
  let target = first;
  let upstream: Response | undefined;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    try {
      upstream = await fetch(target, {
        headers: {
          'User-Agent': process.env.STREAM_PROXY_USER_AGENT ?? USER_AGENT,
          Accept: 'image/avif,image/webp,image/*,*/*',
        },
        cache: 'no-store',
        redirect: 'manual',
        signal: c.req.raw.signal,
      });
    } catch {
      break;
    }
    if (upstream.status < 300 || upstream.status > 399) break;
    const location = upstream.headers.get('location');
    upstream.body?.cancel();
    if (!location) break;
    let next: URL | undefined;
    try {
      next = safeUrl(new URL(location, target).href);
    } catch {
      next = undefined;
    }
    if (!next) {
      log.warn({ requestId, from: target.hostname }, 'redirect host rejected');
      return fail(502, 'Target host is not reachable', 'UPSTREAM');
    }
    target = next;
    upstream = undefined;
  }

  if (!upstream?.ok || !upstream.body) {
    log.warn(
      {
        requestId,
        target: target.href,
        status: upstream?.status,
        durationMs: Date.now() - started,
      },
      'upstream image error',
    );
    return fail(502, 'Image fetch failed', 'UPSTREAM');
  }

  const headers: Record<string, string> = {
    'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream',
    'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
  };
  for (const name of ['Content-Length', 'ETag', 'Last-Modified']) {
    const value = upstream.headers.get(name);
    if (value) headers[name] = value;
  }

  log.info(
    { requestId, status: upstream.status, durationMs: Date.now() - started },
    'image served',
  );
  return c.body(upstream.body, 200, headers);
});
