import { type Context, Hono } from 'hono';
import { encodeBase64Url } from '@/lib/base64url';
import { scopeLogger } from '@/lib/log';
import {
  manifestKind,
  rewriteDashManifest,
  rewriteHlsManifest,
} from '@/lib/streaming/manifestRewriter';
import { parseStreamPath } from '@/lib/streaming/streamUrl';
import { srtToVtt, ttmlToVtt } from '@/lib/streaming/subtitles';
import { fetchUpstream } from '@/lib/streaming/upstream';
import { viewerFromRequest } from '@/lib/viewer';
import { providerAllowsHost } from '@/providers/_shared/urls';
import { providerStreamHeaders } from '@/providers/streamHeaders';
import type { Variables } from '../requestId';

type HeaderMap = Record<string, string>;

const CORS: HeaderMap = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
};

/** Every answer carries the id the server logged, so a failure is traceable. */
function responseHeaders(requestId: string): HeaderMap {
  return { ...CORS, 'x-request-id': requestId };
}

/**
 * Upstream failures answer 502 with a fixed message and keep the detail in the
 * log. A provider's status is not ours to pass through: relaying a CDN's 427 or
 * 530 makes Cloudflare render its own error page in place of the app, and a
 * provider's DNS or TLS error can name internal hosts the client never needs to
 * see.
 */
function upstreamError(requestId: string, error: unknown): Response {
  const thrown = error as { status?: number; upstreamStatus?: number };
  const headers = responseHeaders(requestId);
  scopeLogger('api', { route: '/api/stream' }).warn(
    {
      requestId,
      status: thrown.status ?? 502,
      upstreamStatus: thrown.upstreamStatus,
      detail: String(error),
    },
    'upstream fetch failed',
  );
  return Response.json(
    { error: 'Upstream request failed' },
    { status: thrown.status ?? 502, headers },
  );
}

/**
 * Playback pass-through. Browsers cannot reach provider CDNs directly (CORS
 * plus required Referer/identity headers), so manifests, segments and subtitles
 * are fetched here with the provider's server-side identity and handed back.
 * Manifest children are rewritten to come back through this route, which is the
 * part that makes HLS and DASH playable at all.
 */
export const streamRouter = new Hono<{ Variables: Variables }>();

// `*` in Hono 4.13 matches multi-segment paths but never populates a param, and
// '/stream/*' 404s neither bare '/stream' nor exposes its tail — so the tail is
// captured with an explicit regex param instead.
streamRouter.get('/stream', (c) => streamHandler(c, ''));
streamRouter.get('/stream/:tail{.*}', (c) => streamHandler(c, c.req.param('tail')));

async function streamHandler(c: Context<{ Variables: Variables }>, tail: string) {
  const requestId = c.get('requestId') ?? 'unknown';
  const headers = responseHeaders(requestId);
  const segments = tail.split('/');
  const parsed = parseStreamPath(segments, c.req.query('format') ?? null);
  if (!parsed) {
    return c.json({ error: 'Invalid stream path', code: 'BAD_REQUEST' }, 400, headers);
  }

  let target: URL;
  try {
    target = new URL(parsed.upstreamUrl);
  } catch {
    return c.json({ error: 'Invalid stream target', code: 'BAD_REQUEST' }, 400, headers);
  }
  if (!providerAllowsHost(parsed.providerId, target.hostname)) {
    // Direct response: the 403 must carry the route's own message, and its body
    // shape differs from AppError's, so throwing would lose it.
    return c.json(
      { error: 'Host is not served by this provider', code: 'FORBIDDEN' },
      403,
      headers,
    );
  }

  const identity = providerStreamHeaders(parsed.providerId, target, viewerFromRequest(c.req.raw));

  if (parsed.format) {
    return serveSubtitle(
      c.req.raw,
      requestId,
      headers,
      parsed.providerId,
      target,
      identity,
      parsed.format,
    );
  }
  return serveMedia(c.req.raw, requestId, headers, parsed.providerId, target, identity);
}

async function serveMedia(
  request: Request,
  requestId: string,
  headers: HeaderMap,
  providerId: string,
  target: URL,
  identity: HeaderMap,
): Promise<Response> {
  let response: Response;
  let finalUrl: URL;
  try {
    const result = await fetchUpstream(target, {
      providerId,
      headers: identity,
      range: request.headers.get('range'),
      signal: request.signal,
    });
    response = result.response;
    finalUrl = result.url;
  } catch (error) {
    return upstreamError(requestId, error);
  }

  const detected = manifestKind(response.headers.get('content-type'), finalUrl.toString());
  if (detected) {
    const text = await response.text();
    const toHref = (absoluteUrl: string) =>
      `/api/stream/${encodeURIComponent(providerId)}/${encodeBase64Url(absoluteUrl)}`;
    const rewritten =
      detected === 'dash'
        ? rewriteDashManifest(text, finalUrl.toString(), toHref)
        : rewriteHlsManifest(text, finalUrl.toString(), toHref);
    return new Response(rewritten, {
      status: 200,
      headers: {
        ...headers,
        'Content-Type':
          detected === 'dash' ? 'application/dash+xml' : 'application/vnd.apple.mpegurl',
      },
    });
  }

  if (!response.body) {
    return Response.json({ error: 'Upstream returned an empty body' }, { status: 502, headers });
  }
  const out = new Headers(headers);
  out.set('Content-Type', response.headers.get('content-type') ?? 'application/octet-stream');
  out.set('Cache-Control', 'private, max-age=30');
  for (const name of ['Content-Length', 'Content-Range', 'Accept-Ranges']) {
    const value = response.headers.get(name);
    if (value) out.set(name, value);
  }
  return new Response(response.body, { status: response.status, headers: out });
}

async function serveSubtitle(
  request: Request,
  requestId: string,
  headers: HeaderMap,
  providerId: string,
  target: URL,
  identity: HeaderMap,
  format: 'srt' | 'ttml',
): Promise<Response> {
  try {
    const { response } = await fetchUpstream(target, {
      providerId,
      headers: identity,
      signal: request.signal,
    });
    const text = await response.text();
    return new Response(format === 'ttml' ? ttmlToVtt(text) : srtToVtt(text), {
      status: 200,
      headers: { ...headers, 'Content-Type': 'text/vtt; charset=utf-8' },
    });
  } catch (error) {
    return upstreamError(requestId, error);
  }
}
