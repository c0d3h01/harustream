import { type NextRequest, NextResponse } from 'next/server';

// Stamps every request with a short id for traceability in server logs and
// logs a verbose line per matched request (method, path, duration, status).
// The upstream provider requires no extra headers; we only annotate our own
// route traffic.

const isDev = process.env.NODE_ENV !== 'production';

export function proxy(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 12);
  const started = Date.now();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-request-id', requestId);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('x-request-id', requestId);

  const { pathname, search } = request.nextUrl;
  const method = request.method;
  const durationMs = Date.now() - started;

  // Verbose structured line for every proxied API call. In dev we print
  // directly; production logs are aggregated upstream, so keep a compact
  // line. We avoid importing pino here because middleware runs on the edge
  // runtime where the worker-thread transport is unavailable.
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level: 'info',
    requestId,
    method,
    path: `${pathname}${search}`,
    durationMs,
    env: isDev ? 'dev' : 'prod',
  });
  if (isDev) {
    // biome-ignore lint/suspicious/noConsole: edge middleware can't use pino; verbose dev logging is intentional.
    console.log(`[proxy] ${line}`);
  } else {
    // biome-ignore lint/suspicious/noConsole: edge middleware can't use pino; structured JSON for log aggregators.
    console.log(line);
  }

  return response;
}

export const config = {
  matcher: ['/api/:path*'],
};
