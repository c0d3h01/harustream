// Standalone media streaming proxy, runnable OUTSIDE Next.js/Vercel.
//
// Vercel's datacenter IPs are rejected by some provider CDNs (e.g. the Aliyun
// OSS host behind themoviebox.org returns 403 for cloud IPs), so the app's
// in-function /api/proxy cannot reach those sources from Vercel. This server
// exposes the exact same protocol (/api/proxy?url=&referer=&origin=&...)
// from a host you control (VPS / home server on a residential IP), and the
// player points at it via NEXT_PUBLIC_STREAM_PROXY_URL.
//
// Build:  pnpm build:proxy  ->  dist/proxy-server.cjs  (self-contained, Node only)
// Run:    NODE_ENV=production PORT=8787 node dist/proxy-server.cjs
//
// Env:
//   PORT                listen port (default 8787)
//   PUBLIC_URL          public origin used for rewritten HLS URLs. When unset
//                       the server derives it from the request (X-Forwarded-Proto + Host).
//   STREAM_PROXY_*      forwarded to the shared proxy module (UA / referer / private-host guard).

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import {
  PROXY_HEADER_PARAMS,
  type ProxyHeaderParam,
  proxyStream,
} from '../src/lib/media/streamProxy';

const PORT = Number(process.env.PORT ?? 8787);
const PUBLIC_URL = (process.env.PUBLIC_URL ?? '').trim();

// The public origin this server is reachable at. Rewritten HLS segment/key
// URLs must be absolute and point back here, otherwise the browser resolves
// them against the app origin and the chain breaks.
function proxyOrigin(req: IncomingMessage): string {
  if (PUBLIC_URL) return PUBLIC_URL;
  const proto = String(req.headers['x-forwarded-proto'] ?? 'http')
    .split(',')[0]
    .trim();
  const host = req.headers.host;
  if (!host) return '';
  return `${proto}://${host}`;
}

function writeJson(res: ServerResponse, status: number, body: Record<string, unknown>) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');

  if (url.pathname === '/health' && req.method === 'GET') {
    writeJson(res, 200, { ok: true, service: 'harustream-proxy' });
    return;
  }

  if (url.pathname !== '/api/proxy') {
    writeJson(res, 404, { error: 'Not found' });
    return;
  }

  const target = url.searchParams.get('url')?.trim();
  if (!target) {
    writeJson(res, 400, { error: 'Missing url parameter' });
    return;
  }

  const headers: Partial<Record<ProxyHeaderParam, string>> = {};
  for (const param of PROXY_HEADER_PARAMS) {
    const value = url.searchParams.get(param)?.trim();
    if (value) headers[param] = value;
  }

  // Abort the upstream fetch when the client goes away so long streams don't
  // leak connections. `close` fires for aborted requests before the response
  // ends; once the response is complete we have nothing left to cancel.
  const controller = new AbortController();
  const abort = () => {
    if (!res.writableEnded) controller.abort();
  };
  req.on('aborted', abort);
  res.on('close', abort);

  proxyStream(target, {
    range: req.headers.range,
    headers,
    signal: controller.signal,
    origin: proxyOrigin(req),
  })
    .then((result) => {
      const responseHeaders: Record<string, string> = {
        ...result.headers,
        'Access-Control-Allow-Origin': '*',
      };
      res.writeHead(result.status, responseHeaders);

      if (req.method === 'HEAD') {
        if (typeof result.body !== 'string' && typeof result.body.cancel === 'function') {
          result.body.cancel().catch(() => {});
        }
        res.end();
        return;
      }

      if (typeof result.body === 'string') {
        res.end(result.body);
        return;
      }

      // Pipe the upstream web stream into the Node response. Readable.fromWeb
      // destroys/cancels the source when the response closes, matching the
      // abort above.
      Readable.fromWeb(result.body as never).pipe(res);
    })
    .catch((error: unknown) => {
      if ((error as Error).name === 'AbortError') return;
      const message = (error as Error).message;
      // Map known upstream failures to meaningful status codes, mirroring the
      // Next.js route handler.
      const upstreamMatch = message.match(/^Upstream error \((\d{3})\)$/);
      const status = upstreamMatch ? Number(upstreamMatch[1]) : 502;
      writeJson(res, status >= 400 && status < 600 ? status : 502, {
        error: message,
      });
    });
});

server.listen(PORT, () => {
  // biome-ignore lint/suspicious/noConsole: boot log for a standalone process; no log framework is loaded yet.
  console.log(`[proxy] listening on :${PORT}${PUBLIC_URL ? ` (public ${PUBLIC_URL})` : ''}`);
});
