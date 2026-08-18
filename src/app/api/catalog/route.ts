import { NextResponse } from 'next/server';
import { apiErrorResponse, requestIdOf } from '@/lib/api/respond';
import { scopeLogger } from '@/lib/log';
import { getCategories } from '@/lib/providers/runtime';

export const dynamic = 'force-dynamic';

// GET /api/catalog?provider=<id>
//
// Returns the provider's category list (its `catalog` rails plus genre
// filters) as { title, filter } entries — the same shape the manifest's
// catalog module exports.
export async function GET(request: Request) {
  const log = scopeLogger('api', { route: '/api/catalog' });
  const requestId = requestIdOf(request);
  const started = Date.now();
  const url = new URL(request.url);
  const provider = url.searchParams.get('provider')?.trim() ?? '';
  if (!provider) {
    log.warn({ requestId }, 'missing provider parameter');
    return NextResponse.json({ error: 'Missing provider parameter', requestId }, { status: 400 });
  }
  try {
    const categories = await getCategories(provider);
    log.info(
      { requestId, provider, count: categories.length, durationMs: Date.now() - started },
      'catalog served',
    );
    return NextResponse.json(categories);
  } catch (error) {
    log.error(
      { requestId, provider, error: (error as Error).message, durationMs: Date.now() - started },
      'catalog failed',
    );
    return apiErrorResponse(error, requestId);
  }
}
