import { requestIdOf } from '@/lib/api/respond';
import { scopeLogger } from '@/lib/log';
import { isInternalHost } from '@/lib/net/ssrf';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: Promise<{ encoded: string[] }> };

// GET /api/image/<base64url-encoded upstream URL>
//
// SSRF-guarded image proxy: decodes the base64url-encoded upstream URL,
// fetches it with a browser-like User-Agent, and streams the bytes back with
// long-lived caching headers. The upstream URL is a path segment (not a
// query string), so the Next.js image optimizer never needs a localPatterns
// entry.
export async function GET(request: Request, { params }: Params) {
  const log = scopeLogger('api', { route: '/api/image' });
  const requestId = requestIdOf(request);
  const started = Date.now();
  const { encoded } = await params;
  const segment = encoded[0] ?? '';

  if (!segment) {
    log.warn({ requestId }, 'missing encoded url');
    return Response.json(
      { error: 'Invalid url parameter', requestId },
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  let raw: string;
  try {
    raw = decodeImageUrl(segment);
  } catch {
    log.warn({ requestId }, 'invalid encoded url');
    return Response.json(
      { error: 'Invalid url parameter', requestId },
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    log.warn({ requestId }, 'invalid target url');
    return Response.json(
      { error: 'Invalid url parameter', requestId },
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (target.protocol !== 'https:' && target.protocol !== 'http:') {
    log.warn({ requestId, protocol: target.protocol }, 'non-http url rejected');
    return Response.json(
      { error: 'Only http(s) images are allowed', requestId },
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (!process.env.STREAM_PROXY_ALLOW_PRIVATE && isInternalHost(target.hostname)) {
    log.warn({ requestId, host: target.hostname }, 'internal host rejected');
    return Response.json(
      { error: 'Target host is not reachable', requestId },
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(raw, {
      headers: {
        'User-Agent':
          process.env.STREAM_PROXY_USER_AGENT ??
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Accept: 'image/avif,image/webp,image/*,*/*',
      },
      cache: 'no-store',
      redirect: 'follow',
      signal: request.signal,
    });
  } catch {
    log.error(
      { requestId, target: raw, durationMs: Date.now() - started },
      'upstream image fetch failed',
    );
    return Response.json(
      { error: 'Image fetch failed', requestId },
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }

  if (!upstream.ok || !upstream.body) {
    log.warn(
      { requestId, target: raw, status: upstream.status, durationMs: Date.now() - started },
      'upstream image error',
    );
    return Response.json(
      { error: 'Image fetch failed', requestId },
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream';
  const headers: Record<string, string> = {
    'Content-Type': contentType,
    // Long-lived at both layers: the browser caches for a day, and the CDN
    // holds the optimized bytes for a week, revalidating in the background.
    // Artwork rarely changes, so this keeps 100M users off the proxy entirely.
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
  return new Response(upstream.body, { status: 200, headers });
}

// Decode a base64url-encoded string (with or without padding).
function decodeImageUrl(encoded: string): string {
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const bytes = Buffer.from(padded, 'base64');
  const text = bytes.toString('utf8');
  if (text === '' && encoded.length > 0) throw new Error('invalid base64url');
  return text;
}
