import { NextResponse } from 'next/server';
import { providerFetch } from '@/lib/api/provider';
import { apiErrorResponse, requestIdOf } from '@/lib/api/respond';
import { EpisodeSchema } from '@/lib/api/types';
import { scopeLogger } from '@/lib/log';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const log = scopeLogger('api', { route: '/api/media/[id]/episodes' });
  const requestId = requestIdOf(request);
  const started = Date.now();
  const url = new URL(request.url);
  const provider = url.searchParams.get('provider') ?? undefined;
  if (!id) {
    log.warn({ requestId }, 'missing id');
    return NextResponse.json({ error: 'Missing id', requestId }, { status: 400 });
  }
  try {
    // Upstream param is `url` — the id IS the url.
    const episodes = await providerFetch(
      '/api/episodes',
      EpisodeSchema.array(),
      { url: id },
      provider,
      300,
    );
    log.info(
      { requestId, provider, count: episodes.length, durationMs: Date.now() - started },
      'episodes served',
    );
    return NextResponse.json(episodes);
  } catch (error) {
    log.error(
      { requestId, provider, error: (error as Error).message, durationMs: Date.now() - started },
      'episodes failed',
    );
    return apiErrorResponse(error, requestId);
  }
}
