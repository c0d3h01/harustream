import { requestIdOf } from '@/lib/api/respond';
import { scopeLogger } from '@/lib/log';
import { proxyStream } from '@/lib/media/streamProxy';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/proxy?url=<encoded upstream>&referer=<optional>
//
// Server-side media proxy: fetches the provider's stream (m3u8/mp4) with the
// headers the provider expects and streams it back through our origin. HLS
// manifests are rewritten so every segment request also flows through here,
// sidestepping CORS and referer restrictions.
export async function GET(request: Request) {
  const log = scopeLogger('api', { route: '/api/proxy' });
  const requestId = requestIdOf(request);
  const started = Date.now();
  const url = new URL(request.url);
  const target = url.searchParams.get('url')?.trim();
  const referer = url.searchParams.get('referer')?.trim() || undefined;
  const range = request.headers.get('range');

  if (!target) {
    log.warn({ requestId }, 'missing url parameter');
    return new Response(JSON.stringify({ error: 'Missing url parameter', requestId }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const result = await proxyStream(target, { range, referer, signal: request.signal });
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
