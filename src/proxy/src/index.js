// harustream media proxy — Cloudflare Worker.
//
// Streams provider media through Cloudflare's egress so viewers are never
// blocked by CDN rules that reject datacenter ranges like Vercel's, and so
// provider-required headers (Referer / Origin / User-Agent / Cookie) can be
// injected — browsers cannot set those themselves.
//
//   GET /?url=<encoded upstream>&referer=&origin=&userAgent=&cookie=
//
// Range requests pass through (seeking works), HLS manifests are rewritten so
// every segment/key URL loops back through this worker, and responses are
// CORS-open for hls.js/dash.js. Adapted from the Cf-Workers template shape
// (single fetch handler + open CORS) to harustream's parameter contract.

import { signProxyTarget, verifyProxyTarget } from './token.js';

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const MAX_MANIFEST_BYTES = 2 << 20; // 2 MiB safety cap

function corsHeaders(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    ...extra,
  };
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

// Block loopbacks and RFC1918 targets (SSRF guardrail; mirrors the Next app).
function isInternalHost(host) {
  const lower = host.toLowerCase();
  if (lower === 'localhost' || lower.endsWith('.local') || lower.endsWith('.internal')) return true;
  const v4 = lower.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  return false;
}

// Rewrite an HLS manifest so every URI points back at this worker with the
// same header params (plus a fresh signature, when tokens are enabled).
function rewriteHls(manifestUrl, workerUrl, params, headers, secret) {
  const proxied = async (raw) => {
    let absolute;
    try {
      absolute = new URL(raw, manifestUrl).toString();
    } catch {
      return raw;
    }
    let extra = '';
    if (secret) {
      const signed = await signProxyTarget(absolute, headers, secret);
      if (signed) extra = `&exp=${signed.exp}&sig=${signed.sig}`;
    }
    return `${workerUrl}?url=${encodeURIComponent(absolute)}&${params}${extra}`;
  };
  return {
    async apply(manifestText) {
      const lines = manifestText.split(/\r?\n/);
      const out = [];
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('#')) {
          // Attribute-style URI (keys, maps, alternate renditions).
          const uris = [];
          const replaced = line.replace(/URI="([^"]+)"/gi, (_m, uri) => {
            uris.push(uri);
            return '';
          });
          let restored = replaced;
          for (const uri of uris) {
            restored = restored.replace('URI=""', `URI="${await proxied(uri)}"`);
          }
          out.push(restored);
        } else if (trimmed) {
          out.push(await proxied(trimmed));
        } else {
          out.push(line);
        }
      }
      return out.join('\n');
    },
  };
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    if (request.method !== 'GET') {
      return json({ error: 'Method not allowed' }, 405);
    }

    const url = new URL(request.url);
    const target = url.searchParams.get('url')?.trim();
    if (!target) return json({ error: 'Missing url parameter' }, 400);

    let targetUrl;
    try {
      targetUrl = new URL(target);
    } catch {
      return json({ error: 'Invalid target URL' }, 400);
    }
    if (targetUrl.protocol !== 'https:' && targetUrl.protocol !== 'http:') {
      return json({ error: 'Only http(s) targets are allowed' }, 400);
    }

    const secret = env?.STREAM_PROXY_SECRET || null;
    const headerParams = {};
    for (const name of ['referer', 'origin', 'userAgent', 'cookie']) {
      const value = url.searchParams.get(name)?.trim();
      if (value) headerParams[name] = value;
    }

    // Only URLs this app minted may pass through when token enforcement is on.
    if (
      !(await verifyProxyTarget(
        target,
        headerParams,
        url.searchParams.get('sig'),
        url.searchParams.get('exp'),
        secret,
      ))
    ) {
      return json({ error: 'Invalid signature' }, 403);
    }
    if (isInternalHost(targetUrl.hostname)) {
      return json({ error: 'Target host is not reachable' }, 403);
    }

    const requestHeaders = { Accept: '*/*' };
    requestHeaders['User-Agent'] = headerParams.userAgent || DEFAULT_UA;
    if (headerParams.referer) requestHeaders.Referer = headerParams.referer;
    if (headerParams.origin) requestHeaders.Origin = headerParams.origin;
    if (headerParams.cookie) requestHeaders.Cookie = headerParams.cookie;
    const range = request.headers.get('range');
    if (range) requestHeaders.Range = range;

    let upstream;
    try {
      upstream = await fetch(target, { headers: requestHeaders, redirect: 'follow' });
    } catch {
      return json({ error: 'Upstream unreachable' }, 502);
    }

    // Non-2xx surfaces its status so the player reports a truthful error
    // instead of stalling on an HTML error page.
    if (!upstream.ok) {
      await upstream.body?.cancel().catch(() => {});
      return json({ error: `Upstream error (${upstream.status})` }, upstream.status);
    }

    const contentType = upstream.headers.get('content-type');
    const path = targetUrl.pathname.toLowerCase();
    const isHls =
      path.endsWith('.m3u8') ||
      (contentType ?? '').includes('mpegurl') ||
      (contentType ?? '').includes('vnd.apple');

    const responseHeaders = corsHeaders({
      'Content-Type': contentType || 'application/octet-stream',
      'Cache-Control': isHls ? 'public, max-age=60' : 'public, max-age=3600',
    });

    if (isHls) {
      const text = (await upstream.text()).slice(0, MAX_MANIFEST_BYTES);
      const params = [...url.searchParams.entries()]
        .filter(([key]) => key !== 'url' && key !== 'exp' && key !== 'sig')
        .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
        .join('&');
      const rewritten = await rewriteHls(
        target,
        url.origin + url.pathname,
        params,
        headerParams,
        secret,
      ).apply(text);
      responseHeaders['Content-Type'] = 'application/vnd.apple.mpegurl';
      responseHeaders['Content-Length'] = String(new TextEncoder().encode(rewritten).byteLength);
      return new Response(rewritten, { status: 200, headers: responseHeaders });
    }

    // Preserve range semantics so seeking works.
    for (const name of ['Content-Length', 'Content-Range', 'Accept-Ranges', 'ETag']) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders[name] = value;
    }
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  },
};
