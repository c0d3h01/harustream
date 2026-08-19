import { NextResponse } from 'next/server';
import { apiErrorResponse, requestIdOf } from '@/lib/api/respond';
import { scopeLogger } from '@/lib/log';
import { getEpisodeLinksFor } from '@/media/episodes';

export const dynamic = 'force-dynamic';

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
    const episodes = await getEpisodeLinksFor(link, provider, request.signal);
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
