import { NextResponse } from 'next/server';
import type { Provider } from '@/lib/api/providers';
import { requestIdOf } from '@/lib/api/respond';
import { scopeLogger } from '@/lib/log';
import { getExecutableProviders } from '@/lib/providers/manifest';

export const dynamic = 'force-dynamic';

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
    return NextResponse.json({ success: true, providers });
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
