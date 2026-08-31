import { type NextRequest, NextResponse } from 'next/server';
import { LOCALES, matchLocale, readLocalePreference } from '@/lib/i18n';

// Two jobs, matched separately below:
// 1. /api/* — stamp every request with a short id for traceability in server
//    logs and log a verbose line per matched request (method, path, status).
// 2. Everything else without a locale prefix — redirect to the user's
//    language: explicit cookie choice first, then the browser's
//    Accept-Language ordering. Locale-prefixed paths (/ja/settings) pass
//    straight through; the route segment drives rendering.

const isDev = process.env.NODE_ENV !== 'production';

function hasLocalePrefix(pathname: string): boolean {
  return LOCALES.some((locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`));
}

function pickRequestLocale(request: NextRequest): string {
  const cookie = readLocalePreference(request.cookies.get('harustream.locale')?.value);
  return cookie === 'auto' ? matchLocale(request.headers.get('accept-language')) : cookie;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── API observability ──
  if (pathname.startsWith('/api')) {
    const requestId = crypto.randomUUID().slice(0, 12);
    const started = Date.now();
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-request-id', requestId);
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set('x-request-id', requestId);

    // Verbose structured line for every proxied API call. In dev we print
    // directly; production logs are aggregated upstream, so keep a compact
    // line. Request logging stays dependency-free (no pino) so the proxy is
    // cheap to boot and safe under any runtime the framework picks.
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level: 'info',
      requestId,
      method: request.method,
      path: `${pathname}${request.nextUrl.search}`,
      durationMs: Date.now() - started,
      env: isDev ? 'dev' : 'prod',
    });
    if (isDev) {
      // biome-ignore lint/suspicious/noConsole: structured request log; verbose dev output is intentional.
      console.log(`[proxy] ${line}`);
    } else {
      // biome-ignore lint/suspicious/noConsole: structured JSON for log aggregators.
      console.log(line);
    }

    return response;
  }

  // ── Locale routing ──
  if (!hasLocalePrefix(pathname)) {
    const url = request.nextUrl.clone();
    // Root stays suffix-free: / redirects to /en, not /en/
    url.pathname =
      pathname === '/'
        ? `/${pickRequestLocale(request)}`
        : `/${pickRequestLocale(request)}${pathname}`;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // API logging
    '/api/:path*',
    // Pages: skip Next internals and any path that looks like a file
    // (assets, favicon, manifests) so they never receive a locale redirect.
    '/((?!_next|.*\\..*).*)',
  ],
};
