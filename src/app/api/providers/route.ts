import { NextResponse } from 'next/server';
import { requestIdOf } from '@/lib/api/respond';
import { scopeLogger } from '@/lib/log';
import type { Provider } from '@/lib/state/providers';
import { getExecutableProviders } from '@/providers';

export const dynamic = 'force-dynamic';

// The manifest itself is cached in-process for an hour; the CDN layer keeps
// most provider-list loads from invoking the function at all.
const PROVIDERS_CACHE_CONTROL = 'public, max-age=60, s-maxage=600, stale-while-revalidate=3600';

// GET /api/providers
//
// Live provider list from the manifest (urls.json + manifest.json). This is
// the only provider data the app uses — there is no hardcoded or
// env-configured registry to fall back on. Providers without a dist/ module
// are excluded: they cannot execute any request. When the manifest is
// unreachable the request fails, and the client keeps serving the last known
// list (or an explicit "API unreachable" state on first load).
export async function GET(request: Request) {
  const log = scopeLogger('api', { route: '/api/providers' });
  const requestId = requestIdOf(request);
  const started = Date.now();

  try {
    const entries = await getExecutableProviders();
    const providers: Provider[] = entries.map((entry) => ({
      id: entry.id,
      name: entry.name,
      type: entry.type,
      version: entry.version,
    }));
    log.info(
      { requestId, count: providers.length, durationMs: Date.now() - started },
      'providers fetched from manifest',
    );
    return NextResponse.json(
      { success: true, providers },
      { headers: { 'Cache-Control': PROVIDERS_CACHE_CONTROL } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.warn(
      { requestId, err: message, durationMs: Date.now() - started },
      'provider manifest unreachable',
    );
    return NextResponse.json(
      {
        success: false,
        error: `Could not load providers from the manifest: ${message}`,
        code: 'BAD_GATEWAY',
      },
      { status: 502 },
    );
  }
}
