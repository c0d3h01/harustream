import { NextResponse } from 'next/server';
import { apiErrorResponse, requestIdOf } from '@/lib/api/respond';
import { scopeLogger } from '@/lib/log';
import { getMetaInfo } from '@/lib/providers/runtime';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const log = scopeLogger('api', { route: '/api/media/[id]' });
  const requestId = requestIdOf(request);
  const started = Date.now();
  const url = new URL(request.url);
  const provider = url.searchParams.get('provider')?.trim() ?? '';
  if (!id) {
    log.warn({ requestId }, 'missing id');
    return NextResponse.json({ error: 'Missing id', requestId }, { status: 400 });
  }
  if (!provider) {
    log.warn({ requestId }, 'missing provider parameter');
    return NextResponse.json({ error: 'Missing provider parameter', requestId }, { status: 400 });
  }
  try {
    // The id IS the provider link; the meta module resolves it against the
    // channel's own base URL.
    const meta = await getMetaInfo(provider, id, request.signal);
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
