import { NextResponse } from 'next/server';
import { apiErrorResponse, requestIdOf } from '@/lib/api/respond';
import { scopeLogger } from '@/lib/log';
import { searchCatalog } from '@/media/search';
import { cachedFetch } from '@/providers/cache';

export const dynamic = 'force-dynamic';
// Provider modules may take up to 20s each; keep the function alive past
// Vercel's default timeout.
export const maxDuration = 60;

// Search results are cached briefly at both layers: the in-process
// single-flight cache absorbs repeated queries within one instance and the
// CDN serves identical queries without invoking the function.
const SEARCH_TTL_MS = 60_000;
const SEARCH_CACHE_CONTROL = 'public, max-age=30, s-maxage=60, stale-while-revalidate=300';

// GET /api/search?q=<query>&provider=<optional>
//
// Without a provider the route fans out across every executable provider
// server-side (bounded concurrency + deadline, per-provider degradation) and
// returns deduplicated results annotated with the sources. With a provider
// only that provider is searched.
export async function GET(request: Request) {
  const log = scopeLogger('api', { route: '/api/search' });
  const requestId = requestIdOf(request);
  const started = Date.now();
  const url = new URL(request.url);
  const q = url.searchParams.get('q')?.trim() ?? '';
  const provider = url.searchParams.get('provider')?.trim() || undefined;
  try {
    const results = await cachedFetch(
      `search:${provider ?? ''}|${q.toLowerCase()}`,
      SEARCH_TTL_MS,
      () => searchCatalog(q, provider, request.signal),
    );
    log.info(
      { requestId, provider, q, count: results.length, durationMs: Date.now() - started },
      'search served',
    );
    return NextResponse.json(results, { headers: { 'Cache-Control': SEARCH_CACHE_CONTROL } });
  } catch (error) {
    log.error(
      { requestId, provider, q, error: (error as Error).message, durationMs: Date.now() - started },
      'search failed',
    );
    return apiErrorResponse(error, requestId);
  }
}
