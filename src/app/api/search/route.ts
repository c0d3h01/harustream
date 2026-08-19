import { NextResponse } from 'next/server';
import { apiErrorResponse, requestIdOf } from '@/lib/api/respond';
import { scopeLogger } from '@/lib/log';
import { searchCatalog } from '@/media/search';

export const dynamic = 'force-dynamic';

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
    const results = await searchCatalog(q, provider, request.signal);
    log.info(
      { requestId, provider, q, count: results.length, durationMs: Date.now() - started },
      'search served',
    );
    return NextResponse.json(results);
  } catch (error) {
    log.error(
      { requestId, provider, q, error: (error as Error).message, durationMs: Date.now() - started },
      'search failed',
    );
    return apiErrorResponse(error, requestId);
  }
}
