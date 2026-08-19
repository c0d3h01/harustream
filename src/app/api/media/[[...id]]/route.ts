import { NextResponse } from 'next/server';
import { apiErrorResponse, requestIdOf } from '@/lib/api/respond';
import { scopeLogger } from '@/lib/log';
import { getMediaMeta } from '@/media/catalog';

export const dynamic = 'force-dynamic';

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
    const meta = await getMediaMeta(link, provider, request.signal);
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
