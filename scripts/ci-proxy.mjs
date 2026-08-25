// Multi-provider egress streaming proxy (CI-hosted).
//
// Runs on a GitHub Actions runner and exposes the same passthrough contract
// as harustream's /api/proxy so blocked-provider streams route through
// GitHub's egress IP instead of Vercel's datacenter ranges:
//
//   GET|HEAD /api/proxy?url=<encoded upstream>[&referer=&origin=&userAgent=&cookie=][&token=]
//
//  - Range requests pass through (seeking works)
//  - HLS manifests are rewritten so every segment/key URL points back at
//    this proxy, keeping the browser off provider CDNs entirely
//  - Provider identity headers injected; explicit params win over defaults;
//    on 401/403/406/426/429 one bare retry drops Referer/Origin
//  - PROXY_TOKEN requires ?token= or an Authorization: Bearer header on every proxy call
//
// Usage: node scripts/ci-proxy.mjs   (env: PORT, PROXY_TOKEN, PROXY_UA)

import http from 'node:http';

const PORT = Number(process.env.PORT || 8787);
const TOKEN=(process.env.PROXY_TOKEN || '').trim();
const DEFAULT_UA =
  process.env.PROXY_UA?.trim() ||
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const HEADER_PARAMS = ['referer', 'origin', 'userAgent', 'cookie'];
const AUTH_REJECTIONS=new Set([401, 403, 406, 426, 429]);

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

function proxiedUrl(raw, base, headers) {
  const target = base ? new URL(raw, base).toString() : raw;
  const params = new URLSearchParams({ url: target });
  for (const key of HEADER_PARAMS) {
    if (headers[key]) params.set(key, headers[key]);
  }
  return `/api/proxy?${params.toString()}`;
}

function rewriteHlsManifest(manifest, manifestUrl, headers) {
  const resolve = (raw) => {
    try {
      return proxiedUrl(raw, manifestUrl, headers);
    } catch {
      return raw;
    }
  };
  return manifest
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('#') && /URI="[^"]+"/i.test(line)) {
        return line.replace(/URI="([^"]+)"/gi, (_m, rawUri) => `URI="${resolve(rawUri)}"`);
      }
      if (trimmed && !trimmed.startsWith('#')) return resolve(trimmed);
      return line;
    })
    .join('\n');
}

function isHlsManifest(contentType, url) {
  if (url.split('?')[0].toLowerCase().endsWith('.m3u8')) return true;
  const type = contentType ?? '';
  return type.includes('mpegurl') || type.includes('vnd.apple');
}

function authorized(url, req) {
  if (!TOKEN) return true;
  return (
    url.searchParams.get('token') === TOKEN ||
    req.headers.authorization === `Bearer ${TOKEN}`
  );
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function handle(req, res) {
  const started = Date.now();
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    json(res, 405, { error: 'Method not allowed' });
    return;
  }

  res.setHeader('Access-Control-Allow-Origin', '*');

  // Health endpoint: workflow verification + harustream tunnel probes.
  if (url.pathname === '/healthz') {
    json(res, 200, { ok: true, uptimeSec: Math.round(process.uptime()) });
    return;
  }

  if (url.pathname !== '/api/proxy') {
    json(res, 404, { error: 'Not found' });
    return;
  }
  if (!authorized(url, req)) {
    json(res, 401, { error: 'Unauthorized' });
    return;
  }

  let targetUrl;
  try {
    targetUrl = new URL(url.searchParams.get('url')?.trim() || '');
    if (!/^https?:$/.test(targetUrl.protocol)) throw new Error('bad protocol');
  } catch {
    json(res, 400, { error: 'Invalid target URL' });
    return;
  }

  const explicit = {};
  for (const param of HEADER_PARAMS) {
    const value = url.searchParams.get(param)?.trim();
    if (value) explicit[param] = value;
  }
  const referer = explicit.referer || `${targetUrl.protocol}//${targetUrl.host}`;
  const requestHeaders = {
    'User-Agent': explicit.userAgent || DEFAULT_UA,
    Accept: '*/*',
    Referer: referer,
    Origin: explicit.origin || referer,
  };
  if (explicit.cookie) requestHeaders.Cookie = explicit.cookie;
  if (req.headers.range) requestHeaders.Range = req.headers.range;

  const fetchUpstream = async () => {
    try {
      return await fetch(targetUrl, { headers: requestHeaders, redirect: 'follow' });
    } catch (error) {
      log('fetch-failed', targetUrl.host, error.name, Date.now() - started, 'ms');
      return null;
    }
  };

  let upstream = await fetchUpstream();

  // One bare retry without hotlink identities — some hosts reject them.
  if (!upstream && AUTH_REJECTIONS.has(upstream?.status ?? 0)) {
    await upstream.body?.cancel().catch(() => {});
    delete requestHeaders.Referer;
    delete requestHeaders.Origin;
    upstream = await fetchUpstream();
  }

  if (!upstream || !upstream.ok) {
    const status = upstream?.status ?? 502;
    await upstream?.body?.cancel().catch(() => {});
    log('upstream-error', targetUrl.host, status, Date.now() - started, 'ms');
    json(res, status >= 400 && status < 600 ? status : 502, {
      error: `Upstream error (${status})`,
    });
    return;
  }

  const contentType = upstream.headers.get('content-type');
  const headers = {
    'Content-Type': contentType ?? 'application/octet-stream',
    'Cache-Control': 'public, max-age=3600',
  };
  for (const name of ['Content-Length', 'Content-Range', 'Accept-Ranges', 'ETag']) {
    const value = upstream.headers.get(name);
    if (value) headers[name] = value;
  }

  if (isHlsManifest(contentType, targetUrl.toString())) {
    const rewritten = rewriteHlsManifest(await upstream.text(), targetUrl.toString(), explicit);
    headers['Content-Type'] = 'application/vnd.apple.mpegurl';
    headers['Cache-Control'] = 'public, max-age=60';
    headers['Content-Length'] = String(Buffer.byteLength(rewritten));
    log('served-hls', targetUrl.host, Date.now() - started, 'ms');
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : rewritten);
    return;
  }

  if (!upstream.body) {
    json(res, 502, { error: 'Upstream empty body' });
    return;
  }

  log('served', targetUrl.host, upstream.status, Date.now() - started, 'ms');
  res.writeHead(upstream.status, headers);
  if (req.method === 'HEAD') {
    await upstream.body.cancel().catch(() => {});
    res.end();
    return;
  }
  await upstream.body.pipeTo(
    new WritableStream({
      write(chunk) {
        res.write(chunk);
      },
      close() {
        res.end();
      },
      abort() {
        res.destroy();
      },
    }),
  );
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((error) => {
    log('handler-crash', error.message);
    if (!res.headersSent) json(res, 500, { error: 'Internal error' });
    else res.end();
  });
});

server.keepAliveTimeout = 65_000;
server.headersTimeout = 70_000;
server.listen(PORT, () => {
  log(`ci-proxy listening on :${PORT}`, TOKEN ? '(token required)' : '(no token)');
});
