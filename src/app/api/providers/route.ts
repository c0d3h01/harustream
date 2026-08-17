import { NextResponse } from 'next/server';
import { providerFetch } from '@/lib/api/provider';
import type { Provider } from '@/lib/api/providers';
import { requestIdOf } from '@/lib/api/respond';
import { ProviderEntrySchema } from '@/lib/api/types';
import { scopeLogger } from '@/lib/log';

export const dynamic = 'force-dynamic';

// GET /api/providers
//
// Live provider list fetched from the upstream `/api/providers` endpoint.
// This is the only provider data the app uses — there is no hardcoded or
// env-configured registry to fall back on. When the upstream is unreachable
// the request fails, and the client keeps serving the last known list (or an
// explicit "API unreachable" state on first load).
export async function GET(request: Request) {
  const log = scopeLogger('api', { route: '/api/providers' });
  const requestId = requestIdOf(request);
  const started = Date.now();

  try {
    const entries = await providerFetch('/api/providers', ProviderEntrySchema.array());
    const providers: Provider[] = entries
      .filter((entry) => !entry.disabled)
      .map((entry) => ({
        id: entry.value,
        name: entry.display_name,
        type: entry.type || entry.kind || '',
        version: entry.version ?? undefined,
      }));
    log.info(
      { requestId, count: providers.length, durationMs: Date.now() - started },
      'providers fetched from upstream',
    );
    return NextResponse.json({ success: true, providers });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.warn(
      { requestId, err: message, durationMs: Date.now() - started },
      'upstream provider list unreachable',
    );
    return NextResponse.json(
      {
        success: false,
        error: `Could not load providers from the API: ${message}`,
        code: 'BAD_GATEWAY',
      },
      { status: 502 },
    );
  }
}
