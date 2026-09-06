// The edge streaming proxy. A pure function of its request: every byte of
// context needed to serve it (upstream URL, provider headers, expiry) comes
// from the encrypted token, never from a lookup against anything this
// process remembers. See ../../../../lib/streaming/README.md for the full
// design rationale and ./README.md for this route's request/response
// contract.
//
// No pino here — pino is Node-only and this route runs on the Edge runtime.
// Structured JSON lines via console.log follow the same edge-safe pattern
// already used by the top-level request-logging middleware (src/proxy.ts).

import { canonicalPath } from '@/lib/streaming/cacheKeys';
import {
  manifestKind,
  rewriteDashManifest,
  rewriteHlsManifest,
} from '@/lib/streaming/manifestRewriter';
import { srtToVtt, ttmlToVtt } from '@/lib/streaming/subtitles';
import { PLAYBACK_TOKEN_TTL_MS, verifyProxyToken } from '@/lib/streaming/token';
import type { ProxyResourceKind, ResolvedTarget } from '@/lib/streaming/types';
import { fetchUpstream, UpstreamError } from '@/lib/streaming/upstream';

export const runtime = 'edge';

const RESOURCE_KINDS = new Set<ProxyResourceKind>(['manifest', 'binary', 'subtitle']);

type Params = { params: Promise<{ stream: string[] }> };

function errorResponse(status: number, error: string): Response {
  return Response.json({ error }, { status });
}

function logLine(level: 'info' | 'warn' | 'error', fields: Record<string, unknown>): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), scope: 'proxy', level, ...fields });
  if (level === 'error') {
    // biome-ignore lint/suspicious/noConsole: structured JSON line; this route runs on the Edge runtime, where pino (Node-only) can't load.
    console.error(line);
  } else if (level === 'warn') {
    // biome-ignore lint/suspicious/noConsole: see above.
    console.warn(line);
  } else {
    // biome-ignore lint/suspicious/noConsole: see above.
    console.log(line);
  }
}

export async function GET(request: Request, { params }: Params): Promise<Response> {
  const started = Date.now();
  const { stream } = await params;
  const url = new URL(request.url);

  const parsed = parseStreamPath(stream);
  if (!parsed) return errorResponse(400, 'Invalid proxy path');

  if (parsed.mode === 'chunk') {
    const { mediaId, providerId, variantId, kind, chunkId } = parsed;
    const exp = Number(url.searchParams.get('exp'));
    const token = url.searchParams.get('token');
    if (!token || !Number.isFinite(exp)) return errorResponse(400, 'Missing token');
    // Cheap synchronous check before paying for an async decrypt. The
    // authoritative expiry is the one sealed inside the token itself —
    // verifyProxyToken re-checks it; this cleartext copy is a fast-reject
    // hint only, never trusted for authorization.
    if (exp * 1000 <= Date.now()) return errorResponse(401, 'Token expired');

    const path = canonicalPath(mediaId, providerId, variantId, kind, chunkId);
    const payload = await verifyProxyToken(token, path);
    if (!payload) return errorResponse(403, 'Invalid or expired token');

    return serve(request, { mediaId, providerId, variantId }, kind, payload, started);
  }

  // DASH SegmentTemplate prefix mode — see manifestRewriter.ts's
  // `rewriteDashBaseUrlAsPrefix` for why the token lives in the path here
  // instead of the query string.
  const { mediaId, providerId, variantId, token, rest } = parsed;
  const path = canonicalPath(mediaId, providerId, variantId, 'template', '');
  const payload = await verifyProxyToken(token, path);
  if (!payload) return errorResponse(403, 'Invalid or expired token');

  let target: URL;
  try {
    target = new URL(`${rest}${url.search}`, payload.url);
  } catch {
    return errorResponse(400, 'Invalid segment path');
  }
  return respondBinary(request, target, payload, started);
}

type ChunkPath = {
  mode: 'chunk';
  mediaId: string;
  providerId: string;
  variantId: string;
  kind: ProxyResourceKind;
  chunkId: string;
};

type TemplatePath = {
  mode: 'template';
  mediaId: string;
  providerId: string;
  variantId: string;
  token: string;
  rest: string;
};

function parseStreamPath(stream: string[]): ChunkPath | TemplatePath | null {
  if (stream.length === 5) {
    const [mediaId, providerId, variantId, kind, chunkId] = stream;
    if (!RESOURCE_KINDS.has(kind as ProxyResourceKind)) return null;
    if (!mediaId || !providerId || !variantId || !chunkId) return null;
    return {
      mode: 'chunk',
      mediaId,
      providerId,
      variantId,
      kind: kind as ProxyResourceKind,
      chunkId,
    };
  }
  if (stream.length >= 6 && stream[3] === 'binary' && stream[4] === 'template') {
    const [mediaId, providerId, variantId, , , token, ...restSegments] = stream;
    if (!mediaId || !providerId || !variantId || !token) return null;
    return {
      mode: 'template',
      mediaId,
      providerId,
      variantId,
      token,
      rest: restSegments.map(decodeURIComponent).join('/'),
    };
  }
  return null;
}

async function serve(
  request: Request,
  variant: { mediaId: string; providerId: string; variantId: string },
  kind: ProxyResourceKind,
  payload: ResolvedTarget,
  started: number,
): Promise<Response> {
  let target: URL;
  try {
    target = new URL(payload.url);
  } catch {
    return errorResponse(500, 'Corrupt token payload');
  }

  if (kind === 'manifest') return respondManifest(request, target, variant, payload, started);
  if (kind === 'subtitle') return respondSubtitle(request, target, payload, started);
  return respondBinary(request, target, payload, started);
}

async function respondManifest(
  request: Request,
  target: URL,
  variant: { mediaId: string; providerId: string; variantId: string },
  payload: ResolvedTarget,
  started: number,
): Promise<Response> {
  try {
    const upstream = await fetchUpstream(target, {
      headers: payload.headers,
      signal: request.signal,
    });
    const text = await upstream.text();
    const kind = manifestKind(upstream.headers.get('content-type'), target.toString());
    const ctx = { variant, headers: payload.headers, ttlMs: PLAYBACK_TOKEN_TTL_MS };
    const rewritten =
      kind === 'dash'
        ? await rewriteDashManifest(text, target.toString(), ctx)
        : await rewriteHlsManifest(text, target.toString(), ctx);
    logLine('info', { kind: 'manifest', status: 200, durationMs: Date.now() - started });
    return new Response(rewritten, {
      status: 200,
      headers: {
        'Content-Type': kind === 'dash' ? 'application/dash+xml' : 'application/vnd.apple.mpegurl',
        'Cache-Control': 'private, max-age=4',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    return upstreamFailure(error, started);
  }
}

async function respondBinary(
  request: Request,
  target: URL,
  payload: ResolvedTarget,
  started: number,
): Promise<Response> {
  try {
    const upstream = await fetchUpstream(target, {
      headers: payload.headers,
      range: request.headers.get('range'),
      signal: request.signal,
    });
    if (!upstream.body) return errorResponse(502, 'Upstream returned an empty body');
    const headers = new Headers({
      'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream',
      // Segments and init/key blobs are byte-immutable once published —
      // long, aggressive caching is safe and is the actual latency win:
      // repeat GETs, seek-back, and retried range requests hit cache
      // instead of round-tripping to the provider.
      'Cache-Control': 'public, max-age=21600, immutable',
      'Access-Control-Allow-Origin': '*',
    });
    for (const name of ['Content-Length', 'Content-Range', 'Accept-Ranges', 'ETag']) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    logLine('info', { kind: 'binary', status: upstream.status, durationMs: Date.now() - started });
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (error) {
    return upstreamFailure(error, started);
  }
}

async function respondSubtitle(
  request: Request,
  target: URL,
  payload: ResolvedTarget,
  started: number,
): Promise<Response> {
  try {
    const upstream = await fetchUpstream(target, {
      headers: payload.headers,
      signal: request.signal,
    });
    const text = await upstream.text();
    const converted =
      payload.subtitleFormat === 'ttml'
        ? ttmlToVtt(text)
        : payload.subtitleFormat === 'srt'
          ? srtToVtt(text)
          : text;
    logLine('info', {
      kind: 'subtitle',
      status: upstream.status,
      durationMs: Date.now() - started,
    });
    return new Response(converted, {
      status: upstream.status,
      headers: {
        'Content-Type': 'text/vtt',
        'Cache-Control': 'public, max-age=21600, immutable',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    return upstreamFailure(error, started);
  }
}

function upstreamFailure(error: unknown, started: number): Response {
  const status = error instanceof UpstreamError ? error.status : 502;
  const message = error instanceof Error ? error.message : 'Upstream request failed';
  logLine('error', { status, error: message, durationMs: Date.now() - started });
  return errorResponse(status, message);
}
