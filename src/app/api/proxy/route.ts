import { requestIdOf } from '@/lib/api/respond';
import { scopeLogger } from '@/lib/log';
import {
  PROXY_HEADER_PARAMS,
  type ProxyHeaderParam,
  proxyStream,
  type SubtitleFormat,
} from '@/lib/media/streamProxy';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// A proxy response streams until the source is exhausted; the invocation must
// outlive it. 300s is the Vercel Hobby/Fluid maximum (Pro: 800s).
export const maxDuration = 300;

// GET /api/proxy?url=<encoded upstream>&referer=&origin=&userAgent=&cookie=
//
// Server-side media proxy: fetches the provider's stream (m3u8/mp4) with the
// headers the provider expects and streams it back through our origin. HLS
// manifests are rewritten so every segment request also flows through here,
// sidestepping CORS and referer restrictions. Explicit header params win
// over config defaults and are carried onto rewritten HLS URLs.
export async function GET(request: Request) {
  const log = scopeLogger('api', { route: '/api/proxy' });
  const requestId = requestIdOf(request);
  const started = Date.now();
  const url = new URL(request.url);
  const target = url.searchParams.get('url')?.trim();
  const range = request.headers.get('range');
  const subtitleFormat = url.searchParams.get('subtitleFormat') as SubtitleFormat | null;

  const headers: Partial<Record<ProxyHeaderParam, string>> = {};
  for (const param of PROXY_HEADER_PARAMS) {
    const value = url.searchParams.get(param)?.trim();
    if (value) headers[param] = value;
  }

  if (!target) {
    log.warn({ requestId }, 'missing url parameter');
    return new Response(JSON.stringify({ error: 'Missing url parameter', requestId }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const result = await proxyStream(target, {
      range,
      headers,
      subtitleFormat:
        subtitleFormat === 'srt' || subtitleFormat === 'ttml' ? subtitleFormat : undefined,
      signal: request.signal,
    });
    log.info(
      { requestId, target, status: result.status, durationMs: Date.now() - started },
      'proxy request served',
    );
    return new Response(result.body, { status: result.status, headers: result.headers });
  } catch (error) {
    const message = (error as Error).message;
    log.error(
      { requestId, target, error: message, durationMs: Date.now() - started },
      'proxy request failed',
    );
    // Map known upstream failures to meaningful status codes.
    const upstreamMatch = message.match(/^Upstream error \((\d{3})\)$/);
    const status = upstreamMatch ? Number(upstreamMatch[1]) : 502;
    return Response.json(
      { error: message, requestId },
      { status: status >= 400 && status < 600 ? status : 502 },
    );
  }
}
