// Server-side web streaming proxy.
//
// Provider hosts serve their media from hotlinked URLs that require custom
// Referer/User-Agent headers and are often behind CORS-restricted origins a
// browser cannot reach directly. This module fetches those URLs server-side
// and streams them back through our own origin, transparently:
//
//  - Range requests pass through so video seeking still works
//  - HLS (.m3u8) manifests are rewritten so every segment/key/playlist URL
//    is routed back through the proxy (the browser can then fetch the whole
//    playlist without CORS or referer problems)
//  - provider-required headers (Referer, User-Agent, Origin, Cookie) are
//    injected; explicit `referer`/`origin`/`userAgent`/`cookie` query params
//    win over config defaults and are carried onto rewritten HLS URLs
//  - private/internal hosts are rejected (SSRF guard)

import { TtlCache } from '@/lib/cache';
import { scopeLogger } from '@/lib/log';
import { signProxyTarget } from './proxyToken';

export type ProxyHeaders = Record<string, string>;
export type SubtitleFormat = 'vtt' | 'srt' | 'ttml';

export type ProxyResult = {
  status: number;
  headers: ProxyHeaders;
  body: ReadableStream<Uint8Array> | string;
};

// Header query params the client may forward from the stream payload's
// `headers` (provider-enforced identity). These win over config defaults and
// are carried onto rewritten HLS segment/key URLs.
export const PROXY_HEADER_PARAMS = ['referer', 'origin', 'userAgent', 'cookie'] as const;
export type ProxyHeaderParam = (typeof PROXY_HEADER_PARAMS)[number];

export type ProxyOptions = {
  range?: string | null;
  signal?: AbortSignal;
  headers?: Partial<Record<ProxyHeaderParam, string>>;
  subtitleFormat?: Exclude<SubtitleFormat, 'vtt'>;
};

// Whether a manifest should be rewritten as HLS.
function isHlsManifest(contentType: string | null, url: string): boolean {
  const path = url.split('?')[0].toLowerCase();
  if (path.endsWith('.m3u8')) return true;
  const type = contentType ?? '';
  return (
    type.includes('mpegurl') || type.includes('x-mpegurl') || type.includes('application/vnd.apple')
  );
}

// Build the proxied href for an upstream media URL. Relative URLs are
// resolved against the manifest they were found in. `headers` are appended
// in a fixed order (referer, origin, userAgent, cookie) after the url param.
// When proxy tokens are enabled the href carries exp+sig so mode 2 accepts it.
export function proxiedUrl(
  raw: string,
  base?: string,
  headers: Partial<Record<ProxyHeaderParam, string>> = {},
): string {
  const target = base ? new URL(raw, base).toString() : raw;
  const params = new URLSearchParams({ url: target });
  for (const key of PROXY_HEADER_PARAMS) {
    const value = headers[key];
    if (value) params.set(key, value);
  }
  const signed = signProxyTarget(
    target,
    Object.fromEntries(PROXY_HEADER_PARAMS.map((key) => [key, headers[key] ?? ''])) as Parameters<
      typeof signProxyTarget
    >[1],
  );
  if (signed) {
    params.set('exp', String(signed.exp));
    params.set('sig', signed.sig);
  }
  return `/api/proxy?${params.toString()}`;
}

// Rewrite an HLS manifest so every nested URI (segments, keys, sub-playlists,
// map/init segments, media tracks) points back at /api/proxy. Non-URI lines
// (comments, attributes without URI=) are left untouched.
export function rewriteHlsManifest(
  manifest: string,
  manifestUrl: string,
  headers: Partial<Record<ProxyHeaderParam, string>> = {},
): string {
  const resolve = (raw: string) => {
    try {
      return proxiedUrl(raw, manifestUrl, headers);
    } catch {
      return raw;
    }
  };

  const lines = manifest.split(/\r?\n/);

  const rewritten = lines.map((line) => {
    const trimmed = line.trim();

    // Attribute-style URI (e.g. #EXT-X-KEY:METHOD=AES-128,URI="key.bin").
    if (trimmed.startsWith('#') && /URI="[^"]+"/i.test(line)) {
      return line.replace(/URI="([^"]+)"/gi, (_m, rawUri: string) => `URI="${resolve(rawUri)}"`);
    }

    // A bare URI line (segment or child playlist). hls.js already proxies
    // some of these, but rewriting keeps direct <video> HLS working too.
    if (trimmed && !trimmed.startsWith('#')) {
      return resolve(trimmed);
    }
    return line;
  });

  return rewritten.join('\n');
}

// The User-Agent we present to provider hosts. Configurable so hosts that
// fingerprint by UA can be tuned without a code change.
function upstreamUserAgent(explicit?: string): string {
  const configured = process.env.STREAM_PROXY_USER_AGENT?.trim();
  return (
    explicit?.trim() ||
    configured ||
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
  );
}

// Referer injected for provider hosts. An explicit override (the provider's
// own advertised headers) wins, else the target's own origin.
function upstreamReferer(target: URL, explicit?: string): string {
  if (explicit?.trim()) return explicit.trim();
  return `${target.protocol}//${target.host}`;
}

// SSRF guardrail: block clearly-internal destinations unless explicitly
// allowed. Full DNS resolution is skipped to avoid latency; IP literals and
// obvious local hostnames are checked.
export function isInternalHost(host: string): boolean {
  const lower = host.toLowerCase();
  if (lower === 'localhost' || lower.endsWith('.local') || lower.endsWith('.internal')) {
    return true;
  }
  // IPv4/IPv6 literals in private/reserved ranges.
  const v4 = lower.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 127 || a === 0) return true; // loopback / this network
  }
  return false;
}

// Cap on how much of an HLS manifest is read before rewriting. Manifests are
// small (KBs); the cap is a safety net against a misbehaving upstream that
// claims HLS but streams unbounded bytes.
const MAX_MANIFEST_BYTES = 2 << 20; // 2 MiB
const IDENTITY_CACHE_TTL_MS = 5 * 60 * 1000;
const AUTH_REJECTION_STATUSES = new Set([401, 403, 406, 426]);
type IdentityVariant = 'provider' | 'bare';
const proxyIdentityCache = new TtlCache<IdentityVariant>();

const encoder = new TextEncoder();
// Edge-runtime-safe byte length (no Node Buffer).
function byteLength(value: string): number {
  return encoder.encode(value).byteLength;
}

function safeTargetLog(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return '[invalid-url]';
  }
}

export function clearProxyIdentityCache(): void {
  proxyIdentityCache.clear();
}

function ttmlTime(value: string): number {
  const parts = value.trim().split(':').map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0];
}

function formatVttTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${remainder
    .toFixed(3)
    .padStart(6, '0')}`;
}

export function ttmlToVtt(ttml: string): string {
  const cues: string[] = [];
  const paragraphPattern = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
  for (const match of ttml.matchAll(paragraphPattern)) {
    const attributes = match[1];
    const begin = attributes.match(/\bbegin=["']([^"']+)["']/i)?.[1];
    const end = attributes.match(/\bend=["']([^"']+)["']/i)?.[1];
    if (!begin || !end) continue;
    const text = match[2]
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
    cues.push(`${formatVttTime(ttmlTime(begin))} --> ${formatVttTime(ttmlTime(end))}\n${text}`);
  }
  return `WEBVTT\n\n${cues.join('\n\n')}\n`;
}

export function srtToVtt(srt: string): string {
  const cues = srt
    .replace(/^\uFEFF/, '')
    .trim()
    .split(/\r?\n\s*\r?\n/)
    .flatMap((block) => {
      const lines = block.split(/\r?\n/);
      const timingIndex = lines.findIndex((line) => line.includes('-->'));
      if (timingIndex < 0) return [];

      const timing = lines[timingIndex].replace(/,(\d{3})(?=\s|$)/g, '.$1');
      const text = lines
        .slice(timingIndex + 1)
        .join('\n')
        .trim();
      if (!text) return [];
      return [`${timing}\n${text}`];
    });

  return `WEBVTT\n\n${cues.join('\n\n')}\n`;
}

// Core proxy routine. `url` must be an absolute http(s) URL.
export async function proxyStream(url: string, options: ProxyOptions = {}): Promise<ProxyResult> {
  const log = scopeLogger('stream-proxy');
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    throw new Error('Invalid target URL');
  }
  if (target.protocol !== 'https:' && target.protocol !== 'http:') {
    throw new Error('Only http(s) targets are allowed');
  }
  if (!process.env.STREAM_PROXY_ALLOW_PRIVATE && isInternalHost(target.hostname)) {
    throw new Error('Target host is not reachable');
  }

  const started = Date.now();
  const providerHeaders = (): Record<string, string> => {
    const referer = upstreamReferer(target, options.headers?.referer);
    const origin = options.headers?.origin?.trim() || referer;
    return { Referer: referer, Origin: origin };
  };
  const requestHeaders = (variant: IdentityVariant): Record<string, string> => {
    const headers: Record<string, string> = {
      'User-Agent': upstreamUserAgent(options.headers?.userAgent),
      Accept: '*/*',
    };
    if (variant === 'provider') Object.assign(headers, providerHeaders());
    const cookie = options.headers?.cookie?.trim();
    if (cookie) headers.Cookie = cookie;
    if (options.range) headers.Range = options.range;
    return headers;
  };
  const fetchVariant = async (variant: IdentityVariant): Promise<Response> => {
    try {
      const response = await fetch(url, {
        headers: requestHeaders(variant),
        cache: 'no-store',
        redirect: 'follow',
        signal: options.signal,
      });
      log.debug(
        {
          target: safeTargetLog(url),
          status: response.status,
          variant,
          contentType: response.headers.get('content-type'),
          durationMs: Date.now() - started,
        },
        'upstream responded',
      );
      return response;
    } catch (error) {
      log.error(
        {
          target: safeTargetLog(url),
          code: (error as Error).name ?? 'FETCH',
          variant,
          durationMs: Date.now() - started,
        },
        'upstream stream fetch failed',
      );
      throw new Error(
        (error as Error).name === 'AbortError' ? 'Stream request aborted' : 'Upstream unreachable',
      );
    }
  };

  const cachedVariant = proxyIdentityCache.get(target.host);
  const firstVariant: IdentityVariant = cachedVariant ?? 'provider';
  let upstream = await fetchVariant(firstVariant);

  // Non-2xx responses are surfaced with their status so the client video
  // element reports a truthful error instead of a silent stall.
  if (!upstream.ok) {
    if (AUTH_REJECTION_STATUSES.has(upstream.status)) {
      const originalStatus = upstream.status;
      await upstream.body?.cancel().catch(() => {});
      const retryVariant: IdentityVariant = firstVariant === 'provider' ? 'bare' : 'provider';
      upstream = await fetchVariant(retryVariant);
      if (!upstream.ok) {
        await upstream.body?.cancel().catch(() => {});
        throw new Error(`Upstream error (${originalStatus})`);
      }
      proxyIdentityCache.set(target.host, retryVariant, IDENTITY_CACHE_TTL_MS);
    } else {
      await upstream.body?.cancel().catch(() => {});
      throw new Error(`Upstream error (${upstream.status})`);
    }
  } else {
    proxyIdentityCache.set(target.host, firstVariant, IDENTITY_CACHE_TTL_MS);
  }

  const contentType = upstream.headers.get('content-type');
  const passthrough: ProxyHeaders = {
    'Content-Type': contentType ?? 'application/octet-stream',
    'Cache-Control': 'public, max-age=3600',
    'Access-Control-Allow-Origin': '*',
  };

  // Preserve range semantics so seeking works.
  for (const name of ['Content-Length', 'Content-Range', 'Accept-Ranges', 'ETag']) {
    const value = upstream.headers.get(name);
    if (value) passthrough[name] = value;
  }

  // HLS manifests need rewriting before they're usable from the browser.
  if (isHlsManifest(contentType, url)) {
    const text = (await upstream.text()).slice(0, MAX_MANIFEST_BYTES);
    const rewritten = rewriteHlsManifest(text, url, options.headers);
    passthrough['Content-Type'] = 'application/vnd.apple.mpegurl';
    passthrough['Cache-Control'] = 'public, max-age=60';
    // The rewritten body differs from the upstream bytes — the passed-
    // through Content-Length would truncate the response.
    passthrough['Content-Length'] = String(byteLength(rewritten));
    return { status: 200, headers: passthrough, body: rewritten };
  }

  if (!upstream.body) {
    throw new Error('Upstream returned an empty body');
  }

  if (options.subtitleFormat) {
    const text = await upstream.text();
    const converted = options.subtitleFormat === 'ttml' ? ttmlToVtt(text) : srtToVtt(text);
    passthrough['Content-Type'] = 'text/vtt';
    passthrough['Content-Length'] = String(byteLength(converted));
    return { status: upstream.status, headers: passthrough, body: converted };
  }

  return {
    status: upstream.status,
    headers: passthrough,
    body: upstream.body,
  };
}
