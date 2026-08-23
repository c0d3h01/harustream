import { NextResponse } from 'next/server';
import { apiErrorResponse, requestIdOf } from '@/lib/api/respond';
import { scopeLogger } from '@/lib/log';
import { getEpisodeLinksFor } from '@/media/episodes';
import { cachedFetch } from '@/providers/cache';

export const dynamic = 'force-dynamic';
// Provider modules may take up to 20s each; keep the function alive past
// Vercel's default timeout.
export const maxDuration = 60;

// Episode lists change rarely; cache them like title metadata.
const EPISODES_TTL_MS = 5 * 60 * 1000;
const EPISODES_CACHE_CONTROL = 'public, max-age=60, s-maxage=300, stale-while-revalidate=1800';

type Params = { params: Promise<{ id?: string[] }> };

// GET /api/media/episodes?link=<provider link>&provider=<id>
// GET /api/media/episodes/<link>?provider=<id> (legacy path form)
//
// Resolves a series' episode list. The provider link travels as a query
// param; the legacy path form is still accepted.
export async function GET(request: Request, { params }: Params) {
  const { id = [] } = await params;
  const log = scopeLogger('api', { route: '/api/media/episodes' });
  const requestId = requestIdOf(request);
  const started = Date.now();
  const url = new URL(request.url);
  const link = url.searchParams.get('link')?.trim() || id.join('/');
  const provider = url.searchParams.get('provider')?.trim() ?? '';
  try {
    const episodes = await cachedFetch(`episodes:${provider}|${link}`, EPISODES_TTL_MS, () =>
      getEpisodeLinksFor(link, provider, request.signal),
    );
    log.info(
      { requestId, provider, count: episodes.length, durationMs: Date.now() - started },
      'episodes served',
    );
    return NextResponse.json(episodes, { headers: { 'Cache-Control': EPISODES_CACHE_CONTROL } });
  } catch (error) {
    log.error(
      { requestId, provider, error: (error as Error).message, durationMs: Date.now() - started },
      'episodes failed',
    );
    return apiErrorResponse(error, requestId);
  }
}
