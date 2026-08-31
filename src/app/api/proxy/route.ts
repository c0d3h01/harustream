import { z } from 'zod';
import { apiErrorResponse, requestIdOf } from '@/lib/api/respond';
import { AppError } from '@/lib/errors';
import { scopeLogger } from '@/lib/log';
import { verifyProxyTarget } from '@/lib/media/proxyToken';
import { PROXY_HEADER_PARAMS, type ProxyHeaderParam, proxyStream } from '@/lib/media/streamProxy';
import { selectStreamSource, sources, streamSourceCacheTtlMs } from '@/services/sources';
import { sourcesQuery } from '@/validations/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// A stream response flows until the source is exhausted; the invocation must
// outlive it. 300s is the Vercel Hobby/Fluid maximum (Pro: 800s).
export const maxDuration = 300;

const streamQuery = sourcesQuery.extend({
  sourceId: z.string().trim().min(1).optional(),
});

// GET /api/proxy — the single built-in streaming proxy, identical in local
// dev and production. Two modes:
//
// 1. Resolve & stream (main media): ?provider=<id>&ref=<encoded>&kind=&sourceId=
//    The provider's stream list is resolved and the chosen source streamed in
//    this same invocation. Provider CDNs sign their media URLs for a short
//    window (and may bind the signature to the requesting IP), so signed URLs
//    must never travel through the client.
//
// 2. Passthrough (subtitles, rewritten HLS segments): ?url=<encoded upstream>
//    with optional referer/origin/userAgent/cookie params.
export async function GET(request: Request) {
  const log = scopeLogger('api', { route: '/api/proxy' });
  const requestId = requestIdOf(request);
  const started = Date.now();
  const url = new URL(request.url);
  const target = url.searchParams.get('url')?.trim();
  if (target && target.length > 4096) {
    return apiErrorResponse(new AppError('BAD_REQUEST', 'Invalid proxy target'), requestId);
  }

  // ── Mode 1: resolve provider source, then stream it ──
  if (!target) {
    const parsed = streamQuery.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) {
      return apiErrorResponse(new AppError('BAD_REQUEST', 'Invalid proxy query'), requestId);
    }
    const { provider, ref, kind } = parsed.data;
    try {
      // A video element issues many range requests per playback; every one of
      // them flows through resolution, so cache the stream list longer here.
      const available = await sources(
        provider,
        ref,
        kind,
        request.signal,
        streamSourceCacheTtlMs(),
      );
      // Provider CDNs rotate signed URLs on every scrape, so the requested
      // sourceId may not survive a re-resolution. selectStreamSource
      // degrades gracefully: exact match, then a progressive fallback,
      // rather than failing the whole playback on a stale id.
      const source = selectStreamSource(available, parsed.data.sourceId);
      if (!source) {
        return apiErrorResponse(
          new AppError('NOT_FOUND', 'Requested stream source was not found'),
          requestId,
        );
      }

      const headers: Partial<Record<ProxyHeaderParam, string>> = {};
      for (const [key, value] of Object.entries(source.headers ?? {})) {
        const normalized = key.replace(/[-_]/g, '').toLowerCase();
        const match = PROXY_HEADER_PARAMS.find((param) => param === normalized);
        if (!match || !value) continue;
        headers[match] = value;
      }

      return await respond(request, {
        log,
        requestId,
        started,
        targetUrl: source.url,
        headers,
        label: { provider, sourceId: source.id },
        // Progress streams need byte-range semantics (seeking, resume); the
        // worker forwards this too, so the built-in proxy must mirror it.
        range: request.headers.get('range'),
      });
    } catch (error) {
      return upstreamFailure(error, { log, requestId, started, provider });
    }
  }

  // ── Mode 2: passthrough an explicit upstream URL ──
  const range = request.headers.get('range');
  const subtitleFormat = url.searchParams.get('subtitleFormat')?.trim();
  const headers: Partial<Record<ProxyHeaderParam, string>> = {};
  for (const param of PROXY_HEADER_PARAMS) {
    const value = url.searchParams.get(param)?.trim();
    if (value && value.length <= 2048) headers[param] = value;
  }
  // When STREAM_PROXY_SECRET is configured, only URLs this app minted may
  // pass through — otherwise the endpoint is an open relay for anyone.
  if (
    !verifyProxyTarget(target, headers, url.searchParams.get('sig'), url.searchParams.get('exp'))
  ) {
    return apiErrorResponse(new AppError('FORBIDDEN', 'Invalid proxy signature'), requestId);
  }
  return await respond(request, {
    log,
    requestId,
    started,
    targetUrl: target,
    headers,
    label: {},
    range,
    subtitleFormat:
      subtitleFormat === 'srt' || subtitleFormat === 'ttml' ? subtitleFormat : undefined,
  });
}

type RespondArgs = {
  log: ReturnType<typeof scopeLogger>;
  requestId: string;
  started: number;
  targetUrl: string;
  headers: Partial<Record<ProxyHeaderParam, string>>;
  label: Record<string, unknown>;
  range?: string | null;
  subtitleFormat?: 'srt' | 'ttml';
};

async function respond(request: Request, args: RespondArgs): Promise<Response> {
  const { log, requestId, started, targetUrl, headers, label, range, subtitleFormat } = args;
  try {
    const result = await proxyStream(targetUrl, {
      range,
      headers,
      signal: request.signal,
      subtitleFormat,
    });
    log.info(
      { requestId, ...label, status: result.status, durationMs: Date.now() - started },
      'proxy request served',
    );
    return new Response(result.body, { status: result.status, headers: result.headers });
  } catch (error) {
    return upstreamFailure(error, { log, requestId, started });
  }
}

function upstreamFailure(
  error: unknown,
  ctx: {
    log: ReturnType<typeof scopeLogger>;
    requestId: string;
    started: number;
    provider?: string;
  },
): Response {
  const rawMessage = error instanceof Error ? error.message : 'Upstream request failed';
  const message = rawMessage.replace(/https?:\/\/[^\s)]+/gi, '[upstream]');
  ctx.log.error(
    {
      requestId: ctx.requestId,
      provider: ctx.provider,
      error: message,
      durationMs: Date.now() - ctx.started,
    },
    'proxy request failed',
  );
  // Map known upstream failures to meaningful status codes.
  const upstreamMatch = message.match(/^Upstream error \((\d{3})\)$/);
  const status = upstreamMatch ? Number(upstreamMatch[1]) : 502;
  return Response.json(
    { error: message, requestId: ctx.requestId },
    { status: status >= 400 && status < 600 ? status : 502 },
  );
}
