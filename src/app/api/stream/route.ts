import { NextResponse } from 'next/server';
import { apiErrorResponse, requestIdOf } from '@/lib/api/respond';
import { scopeLogger } from '@/lib/log';
import { getStreams } from '@/lib/providers/runtime';

export const dynamic = 'force-dynamic';

// GET /api/stream?hub=<url>&type=movie|series&provider=<id>
// `hub` is the link from meta.linkList (movies) or an episode link (series).
// The provider's stream module follows it and returns the playable sources.
export async function GET(request: Request) {
  const log = scopeLogger('api', { route: '/api/stream' });
  const requestId = requestIdOf(request);
  const started = Date.now();
  const url = new URL(request.url);
  const hub = url.searchParams.get('hub')?.trim();
  const type = url.searchParams.get('type') ?? 'movie';
  const provider = url.searchParams.get('provider')?.trim() ?? '';
  if (!hub) {
    log.warn({ requestId }, 'missing hub parameter');
    return NextResponse.json({ error: 'Missing hub parameter', requestId }, { status: 400 });
  }
  if (!provider) {
    log.warn({ requestId }, 'missing provider parameter');
    return NextResponse.json({ error: 'Missing provider parameter', requestId }, { status: 400 });
  }
  try {
    const stream = await getStreams(provider, hub, type, request.signal);
    log.info(
      { requestId, provider, type, count: stream.length, durationMs: Date.now() - started },
      'stream resolved',
    );
    return NextResponse.json(stream);
  } catch (error) {
    log.error(
      {
        requestId,
        provider,
        type,
        error: (error as Error).message,
        durationMs: Date.now() - started,
      },
      'stream resolution failed',
    );
    return apiErrorResponse(error, requestId);
  }
}
