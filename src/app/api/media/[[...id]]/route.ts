import { NextResponse } from 'next/server';
import { apiErrorResponse, requestIdOf } from '@/lib/api/respond';
import { scopeLogger } from '@/lib/log';
import { getMediaMeta } from '@/media/catalog';
import { cachedFetch } from '@/providers/cache';

export const dynamic = 'force-dynamic';
// Provider modules may take up to 20s each; keep the function alive past
// Vercel's default timeout.
export const maxDuration = 60;

// Title metadata is stable for minutes; both cache layers keep repeated
// detail-page opens from re-scraping the provider page.
const META_TTL_MS = 5 * 60 * 1000;
const META_CACHE_CONTROL = 'public, max-age=60, s-maxage=300, stale-while-revalidate=1800';

type Params = { params: Promise<{ id?: string[] }> };

// GET /api/media?link=<provider link>&provider=<id>
// GET /api/media/<link>?provider=<id> (legacy path form)
//
// Returns the provider's metadata for a media page. The provider link is
// carried as a query param (relative URLs full of slashes are fragile inside
// URL paths); the legacy path form is still accepted.
export async function GET(request: Request, { params }: Params) {
  const { id = [] } = await params;
  const log = scopeLogger('api', { route: '/api/media' });
  const requestId = requestIdOf(request);
  const started = Date.now();
  const url = new URL(request.url);
  const link = url.searchParams.get('link')?.trim() || id.join('/');
  const provider = url.searchParams.get('provider')?.trim() ?? '';
  try {
    // The link IS the provider link; the meta module resolves it against the
    // channel's own base URL.
    const meta = await cachedFetch(`meta:${provider}|${link}`, META_TTL_MS, () =>
      getMediaMeta(link, provider, request.signal),
    );
    log.info({ requestId, provider, durationMs: Date.now() - started }, 'meta served');
    return NextResponse.json(meta, { headers: { 'Cache-Control': META_CACHE_CONTROL } });
  } catch (error) {
    log.error(
      { requestId, provider, error: (error as Error).message, durationMs: Date.now() - started },
      'meta failed',
    );
    return apiErrorResponse(error, requestId);
  }
}
