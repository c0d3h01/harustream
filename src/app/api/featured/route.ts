import { NextResponse } from 'next/server';
import { apiErrorResponse, requestIdOf } from '@/lib/api/respond';
import { scopeLogger } from '@/lib/log';
import { getFeaturedFeed } from '@/media/catalog';
import { cachedFetch } from '@/providers/cache';

export const dynamic = 'force-dynamic';

// GET /api/featured?provider=<optional>&preferred=<optional>
//
// Powers the home rails (featured / newest / movies / series). With a
// provider the route pulls that provider's catalog filters and builds the
// rails from its movie-ish and series-ish pages. Without a provider it fans
// out across every executable provider server-side and merges the results,
// so a single slow or broken channel can't sink the home page. `preferred`
// only reorders the fan-out so the default channel's content leads each rail.
//
// Scale: this is the hottest endpoint in the app (every home-screen load hits
// it). Two layers absorb the load — an in-process single-flight TTL cache so a
// burst of users doesn't stampede the upstream provider sites, and a CDN-level
// Cache-Control so Vercel's edge serves the same feed to most users without
// invoking this function at all. `stale-while-revalidate` keeps the feed fresh
// in the background after it expires.
const FEED_TTL_MS = 60_000;
const FEED_CACHE_CONTROL = 'public, max-age=30, s-maxage=60, stale-while-revalidate=300';

export async function GET(request: Request) {
  const log = scopeLogger('api', { route: '/api/featured' });
  const requestId = requestIdOf(request);
  const started = Date.now();
  const url = new URL(request.url);
  const provider = url.searchParams.get('provider')?.trim() || undefined;
  const preferred = url.searchParams.get('preferred')?.trim() || undefined;
  try {
    const feed = await cachedFetch(
      `featured:${provider ?? ''}|${preferred ?? ''}`,
      FEED_TTL_MS,
      () => getFeaturedFeed(provider, preferred, request.signal),
    );
    log.info(
      {
        requestId,
        provider,
        preferred,
        featured: feed.featured.length,
        newest: feed.newest.length,
        movies: feed.movies.length,
        series: feed.series.length,
        durationMs: Date.now() - started,
      },
      'featured feed served',
    );
    return NextResponse.json(feed, { headers: { 'Cache-Control': FEED_CACHE_CONTROL } });
  } catch (error) {
    log.error(
      { requestId, provider, error: (error as Error).message, durationMs: Date.now() - started },
      'featured feed failed',
    );
    return apiErrorResponse(error, requestId);
  }
}
