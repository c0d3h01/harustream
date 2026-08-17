import { NextResponse } from 'next/server';
import { ProviderError } from '@/lib/api/errors';
import { providerFetch } from '@/lib/api/provider';
import { apiErrorResponse, requestIdOf } from '@/lib/api/respond';
import { MediaSchema } from '@/lib/api/types';
import { scopeLogger } from '@/lib/log';

export const dynamic = 'force-dynamic';

// /api/featured powers the home rails. The upstream's /api/catalog returns
// only a list of categories, not a media feed. We fan out to a few upstream
// searches targeted at movie titles (contain "1080p") and series titles
// (contain "Season"), then combine them with a general pool for the other
// rails. Each rail is sliced independently so they don't compete.
const MOVIE_QUERY = '1080p';
const SERIES_QUERY = 'Season';
const FEATURED_QUERY = '4K';

async function search(query: string, provider?: string) {
  return providerFetch('/api/search', MediaSchema.array(), { query }, provider, 300);
}

// Runs a rail query but records whether it failed, so the caller can tell a
// provider outage (all rails empty because the upstream was unreachable) apart
// from a provider that genuinely has no matching titles.
async function searchRail(
  query: string,
  provider: string | undefined,
): Promise<{ items: import('@/lib/api/types').Media[]; failed: boolean }> {
  try {
    const items = await search(query, provider);
    return { items, failed: false };
  } catch (error) {
    log.warn({ query, provider, error: (error as Error).message }, 'featured rail search failed');
    return { items: [], failed: true };
  }
}

const log = scopeLogger('api', { route: '/api/featured' });

export async function GET(request: Request) {
  const requestId = requestIdOf(request);
  const started = Date.now();
  const url = new URL(request.url);
  const provider = url.searchParams.get('provider') ?? undefined;
  const [movies, series, featured] = await Promise.all([
    searchRail(MOVIE_QUERY, provider),
    searchRail(SERIES_QUERY, provider),
    searchRail(FEATURED_QUERY, provider),
  ]);
  const failedCount = [movies.failed, series.failed, featured.failed].filter(Boolean).length;

  // Search is type-agnostic upstream: the "1080p" query can surface series
  // that also match a quality token, and "Season" can surface movies whose
  // metadata mentions it. Filter each rail to the media type it labels so a
  // series never shows in the movies rail (and vice versa).
  const movieItems = movies.items.filter((item) => item.type === 'movie');
  const seriesItems = series.items.filter((item) => item.type === 'series');
  const featuredItems = featured.items.filter((item) => item.type === 'movie');

  // When every rail is empty because the upstream was unreachable, surface
  // the outage as an error instead of silently rendering an empty home page.
  // Partial failure still degrades to the rails that succeeded.
  if (failedCount === 3) {
    log.error(
      { requestId, provider, durationMs: Date.now() - started },
      'featured feed failed: provider unreachable for every rail',
    );
    return apiErrorResponse(
      new ProviderError(
        503,
        'The streaming source is temporarily unavailable. Try again shortly.',
        undefined,
        'UNAVAILABLE',
      ),
      requestId,
    );
  }

  // Combine into a single pool for the "newest" rail. Dedupe by link — the
  // upstream searches can return the same title in multiple rails, and the
  // Rails key `${title}-${item.link}` must stay unique.
  const seen = new Set<string>();
  const newestPool = [...movieItems, ...seriesItems, ...featuredItems].filter((item) => {
    if (seen.has(item.link)) return false;
    seen.add(item.link);
    return true;
  });
  log.info(
    {
      requestId,
      provider,
      movies: movieItems.length,
      series: seriesItems.length,
      featured: featuredItems.length,
      failedRails: failedCount,
      durationMs: Date.now() - started,
    },
    'featured feed served',
  );
  return NextResponse.json({
    featured: featuredItems.slice(0, 6) as import('@/lib/api/types').Media[],
    newest: newestPool.slice(0, 12) as import('@/lib/api/types').Media[],
    movies: movieItems.slice(0, 12) as import('@/lib/api/types').Media[],
    series: seriesItems.slice(0, 12) as import('@/lib/api/types').Media[],
  });
}
