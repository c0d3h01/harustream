import { NextResponse } from 'next/server';
import { PROVIDER_BASES } from '@/lib/api/config';
import { requestIdOf } from '@/lib/api/respond';
import { scopeLogger } from '@/lib/log';

export const dynamic = 'force-dynamic';

// GET /api/health
//
// Lightweight liveness + upstream status probe. Returns 200 when the app is
// up (even if the provider is down) with a `provider` section describing each
// configured upstream. Used by uptime monitors and the settings UI.
export async function GET(request: Request) {
  const log = scopeLogger('api', { route: '/api/health' });
  const requestId = requestIdOf(request);
  const started = Date.now();

  const providers = await Promise.all(
    PROVIDER_BASES.map(async (base) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch(`${base}/api/catalog`, {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
          cache: 'no-store',
        });
        return {
          url: base,
          status: response.status,
          healthy: response.ok,
          latencyMs: Date.now() - started,
        };
      } catch (error) {
        return {
          url: base,
          status: 0,
          healthy: false,
          latencyMs: Date.now() - started,
          error: (error as Error).name,
        };
      } finally {
        clearTimeout(timer);
      }
    }),
  );

  const healthyCount = providers.filter((p) => p.healthy).length;
  log.info(
    { requestId, healthyCount, total: providers.length, durationMs: Date.now() - started },
    'health probe complete',
  );

  return NextResponse.json(
    {
      status: 'ok',
      uptime: process.uptime(),
      providers,
      degraded: healthyCount === 0,
    },
    { status: 200 },
  );
}
