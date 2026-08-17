import { NextResponse } from 'next/server';
import { providerFetch } from '@/lib/api/provider';
import { apiErrorResponse, requestIdOf } from '@/lib/api/respond';
import { MetaSchema } from '@/lib/api/types';
import { scopeLogger } from '@/lib/log';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const log = scopeLogger('api', { route: '/api/media/[id]' });
  const requestId = requestIdOf(request);
  const started = Date.now();
  const url = new URL(request.url);
  const provider = url.searchParams.get('provider') ?? undefined;
  if (!id) {
    log.warn({ requestId }, 'missing id');
    return NextResponse.json({ error: 'Missing id', requestId }, { status: 400 });
  }
  try {
    // Upstream param is `link` — the id we received IS the link.
    const meta = await providerFetch('/api/meta', MetaSchema, { link: id }, provider, 60);
    log.info({ requestId, provider, durationMs: Date.now() - started }, 'meta served');
    return NextResponse.json(meta);
  } catch (error) {
    log.error(
      { requestId, provider, error: (error as Error).message, durationMs: Date.now() - started },
      'meta failed',
    );
    return apiErrorResponse(error, requestId);
  }
}
