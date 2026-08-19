import { NextResponse } from 'next/server';
import { requestIdOf } from '@/lib/api/respond';
import { scopeLogger } from '@/lib/log';
import { getProviders, isProviderRuntimeConfigured, PROVIDER_MANIFEST_URL } from '@/providers';

export const dynamic = 'force-dynamic';

// GET /api/health
//
// Lightweight liveness + manifest status probe. Returns 200 when the app is
// up (even if the manifest is down) with a `providers` section describing the
// live manifest. Used by uptime monitors and the settings UI.
export async function GET(request: Request) {
  const log = scopeLogger('api', { route: '/api/health' });
  const requestId = requestIdOf(request);
  const started = Date.now();

  const configured = isProviderRuntimeConfigured();
  let healthy = false;
  let count = 0;
  let error: string | undefined;
  if (configured) {
    try {
      const providers = await getProviders();
      count = providers.length;
      healthy = count > 0;
    } catch (err) {
      error = err instanceof Error ? err.name : String(err);
    }
  } else {
    error = 'PROVIDER_MANIFEST_URL is not configured';
  }

  log.info(
    { requestId, healthy, count, error, durationMs: Date.now() - started },
    'health probe complete',
  );

  return NextResponse.json(
    {
      status: 'ok',
      uptime: process.uptime(),
      manifest: {
        url: PROVIDER_MANIFEST_URL,
        configured,
        healthy,
        providerCount: count,
        ...(error ? { error } : {}),
      },
      degraded: !configured || !healthy,
    },
    { status: 200 },
  );
}
