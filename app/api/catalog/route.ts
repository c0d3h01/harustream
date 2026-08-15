import { NextResponse } from 'next/server';
import { providerFetch } from '@/lib/api/provider';
import { apiErrorResponse, requestIdOf } from '@/lib/api/respond';
import { CategorySchema } from '@/lib/api/types';
import { scopeLogger } from '@/lib/log';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const log = scopeLogger('api', { route: '/api/catalog' });
  const requestId = requestIdOf(request);
  const started = Date.now();
  const url = new URL(request.url);
  const provider = url.searchParams.get('provider') ?? undefined;
  try {
    const categories = await providerFetch(
      '/api/catalog',
      CategorySchema.array(),
      {},
      provider,
      300,
    );
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
