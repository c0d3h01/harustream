// HMAC-signed target verification for the media proxy worker.
//
// Mirrors src/lib/media/proxyToken.ts byte-for-byte:
//   payload = "proxy-v1\n<url>\n<exp>\n<referer>\n<origin>\n<userAgent>\n<cookie>"
//   sig = hex(HMAC-SHA256(STREAM_PROXY_SECRET, payload))
// When the secret is configured, only URLs minted by this app (or by a
// previous hop through this same secret) are fetchable — otherwise ?url=
// is an open relay.

const TOKEN_VERSION = 'proxy-v1';
const HEADER_NAMES = ['referer', 'origin', 'userAgent', 'cookie'];

function canonicalHeaders(headers) {
  return HEADER_NAMES.map((key) => [key, (headers?.[key] ?? '').trim()]);
}

function canonicalPayload(url, headers, expSeconds) {
  return [
    TOKEN_VERSION,
    url,
    String(Math.floor(expSeconds)),
    ...canonicalHeaders(headers).map(([, v]) => v),
  ].join('\n');
}

function bytesToHex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacHex(payload, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return bytesToHex(digest);
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Sign a passthrough target. Returns null when no secret is configured. */
export async function signProxyTarget(url, headers, secret, now = Date.now()) {
  if (!secret) return null;
  const exp = Math.ceil(now / 1000);
  const sig = await hmacHex(canonicalPayload(url, headers, exp), secret);
  return { sig, exp };
}

/**
 * Verify a signed target. Tokens disabled => allow; anything missing,
 * expired, or tampered => reject.
 */
export async function verifyProxyTarget(url, headers, sig, exp, secret, now = Date.now()) {
  if (!secret) return true;
  if (!sig || !exp) return false;
  const expSeconds = Number(exp);
  if (!Number.isSafeInteger(expSeconds)) return false;
  if (expSeconds <= Math.floor(now / 1000)) return false;
  const expected = await hmacHex(canonicalPayload(url, headers, expSeconds), secret);
  return constantTimeEqual(expected, String(sig).trim());
}
