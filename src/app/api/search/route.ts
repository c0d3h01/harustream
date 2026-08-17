import { NextResponse } from 'next/server';
import { providerFetch } from '@/lib/api/provider';
import { apiErrorResponse, requestIdOf } from '@/lib/api/respond';
import { MediaSchema } from '@/lib/api/types';
import { scopeLogger } from '@/lib/log';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const log = scopeLogger('api', { route: '/api/search' });
  const requestId = requestIdOf(request);
  const started = Date.now();
  const url = new URL(request.url);
  const q = url.searchParams.get('q')?.trim();
  const provider = url.searchParams.get('provider') ?? undefined;
  if (!q) {
    log.warn({ requestId }, 'missing q parameter');
    return NextResponse.json({ error: 'Missing q parameter', requestId }, { status: 400 });
  }
  try {
    // Upstream param is `query`, not `q`.
    const results = await providerFetch('/api/search', MediaSchema.array(), { query: q }, provider);
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
