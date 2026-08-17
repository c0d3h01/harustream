import { NextResponse } from 'next/server';
import { providerFetch } from '@/lib/api/provider';
import { apiErrorResponse, requestIdOf } from '@/lib/api/respond';
import { StreamSchema } from '@/lib/api/types';
import { scopeLogger } from '@/lib/log';

export const dynamic = 'force-dynamic';

// GET /api/stream?hub=<url>&type=movie|series
// `hub` is the URL returned by /api/episodes or meta.linkList. The upstream
// follows it and returns the actual playable m3u8/mp4 sources.
export async function GET(request: Request) {
  const log = scopeLogger('api', { route: '/api/stream' });
  const requestId = requestIdOf(request);
  const started = Date.now();
  const url = new URL(request.url);
  const hub = url.searchParams.get('hub')?.trim();
  const type = url.searchParams.get('type') ?? 'movie';
  const provider = url.searchParams.get('provider') ?? undefined;
  if (!hub) {
    log.warn({ requestId }, 'missing hub parameter');
    return NextResponse.json({ error: 'Missing hub parameter', requestId }, { status: 400 });
  }
  try {
    const stream = await providerFetch(
      '/api/stream',
      StreamSchema,
      {
        link: hub,
        type,
      },
      provider,
    );
    log.info({ requestId, provider, type, durationMs: Date.now() - started }, 'stream resolved');
    return NextResponse.json(stream ?? []);
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
