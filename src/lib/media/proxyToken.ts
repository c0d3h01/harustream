// HMAC-signed targets for /api/proxy and the Cloudflare Worker.
//
// Mode 2 of the proxy ("passthrough an arbitrary upstream URL") is otherwise
// an open relay anyone can use to fetch third-party content anonymously,
// inject provider headers at will, and burn egress. A signed target binds the
// upstream URL plus its header set under STREAM_PROXY_SECRET with an expiry,
// so only URLs this app minted are fetchable through us.
//
// Contract (shared verbatim with src/proxy/src/token.js): payload =
//   "proxy-v1\n<url>\n<exp>\n<referer>\n<origin>\n<userAgent>\n<cookie>"
// sig = hex(HMAC-SHA256(secret, payload)), exp = unix seconds.

import { createHmac, timingSafeEqual } from 'node:crypto';

import type { ProxyHeaderParam } from './streamProxy';

export type ProxyTokenHeaders = Partial<Record<ProxyHeaderParam, string>>;

const DEFAULT_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const TOKEN_VERSION = 'proxy-v1';

export function proxyTokensEnabled(): boolean {
  return Boolean(proxyTokenSecret());
}

function proxyTokenSecret(): string | undefined {
  return process.env.STREAM_PROXY_SECRET?.trim() || undefined;
}

function tokenTtlMs(): number {
  const raw = Number(process.env.STREAM_PROXY_TOKEN_TTL_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TOKEN_TTL_MS;
}

/** Deterministic header shape shared by signer and verifier. */
function canonicalHeaders(headers?: ProxyTokenHeaders): [string, string][] {
  return (['referer', 'origin', 'userAgent', 'cookie'] as const).map((key) => [
    key,
    headers?.[key]?.trim() ?? '',
  ]);
}

function canonicalPayload(
  url: string,
  headers: ProxyTokenHeaders | undefined,
  exp: number,
): string {
  const expSeconds = Math.floor(exp);
  return [
    TOKEN_VERSION,
    url,
    String(expSeconds),
    ...canonicalHeaders(headers).map(([, v]) => v),
  ].join('\n');
}

function hmac(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/** Sign a passthrough target; null when tokens are disabled (local dev). */
export function signProxyTarget(
  url: string,
  headers?: ProxyTokenHeaders,
  now: number = Date.now(),
): { sig: string; exp: number } | null {
  const secret = proxyTokenSecret();
  if (!secret) return null;
  const exp = Math.ceil(now + tokenTtlMs());
  return { sig: hmac(canonicalPayload(url, headers, exp), secret), exp };
}

/**
 * Verify a signed passthrough target. Local development may use unsigned
 * targets; production always fails closed when the signing secret is missing.
 */
export function verifyProxyTarget(
  url: string,
  headers: ProxyTokenHeaders | undefined,
  sig: string | null | undefined,
  exp: string | null | undefined,
  now: number = Date.now(),
): boolean {
  const secret = proxyTokenSecret();
  if (!secret) return process.env.NODE_ENV !== 'production';
  if (!sig || !exp) return false;
  const expSeconds = Number(exp);
  if (!Number.isSafeInteger(expSeconds)) return false;
  if (expSeconds <= Math.floor(now / 1000)) return false;
  const expected = Buffer.from(hmac(canonicalPayload(url, headers, expSeconds), secret));
  const received = Buffer.from(sig.trim());
  // Same length required before timingSafeEqual (it throws on length skew).
  return expected.length === received.length && timingSafeEqual(expected, received);
}
