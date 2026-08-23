import { NextResponse } from 'next/server';
import { apiErrorResponse, requestIdOf } from '@/lib/api/respond';
import { scopeLogger } from '@/lib/log';
import { getCatalogCategories } from '@/media/catalog';
import { cachedFetch } from '@/providers/cache';

export const dynamic = 'force-dynamic';

// Category lists change with the provider module (cached for hours), so the
// CDN can hold them for a long time.
const CATALOG_TTL_MS = 60 * 60 * 1000;
const CATALOG_CACHE_CONTROL = 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400';

// GET /api/catalog?provider=<id>
//
// Returns the provider's category list (its `catalog` rails plus genre
// filters) as { title, filter } entries — the same shape the manifest's
// catalog module exports.
export async function GET(request: Request) {
  const log = scopeLogger('api', { route: '/api/catalog' });
  const requestId = requestIdOf(request);
  const started = Date.now();
  const provider = new URL(request.url).searchParams.get('provider')?.trim() ?? '';
  try {
    const categories = await cachedFetch(`catalog:${provider}`, CATALOG_TTL_MS, () =>
      getCatalogCategories(provider),
    );
    log.info(
      { requestId, provider, count: categories.length, durationMs: Date.now() - started },
      'catalog served',
    );
    return NextResponse.json(categories, { headers: { 'Cache-Control': CATALOG_CACHE_CONTROL } });
  } catch (error) {
    log.error(
      { requestId, provider, error: (error as Error).message, durationMs: Date.now() - started },
      'catalog failed',
    );
    return apiErrorResponse(error, requestId);
  }
}
