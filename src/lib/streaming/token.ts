// Self-contained, path-bound playback tokens.
//
// AES-256-GCM via Web Crypto (`crypto.subtle`) — identical API on Node ≥ 19
// and the Edge runtime, unlike `node:crypto`, which Edge cannot use. Encrypts
// `{ url, headers, exp }` under a key derived from STREAM_PROXY_SECRET. GCM's
// authentication tag makes the token self-authenticating: tampering with the
// ciphertext fails decryption outright, so there is no separate signature
// field — the token *is* the signature.
//
// Path binding: the canonical `{mediaId}/{providerId}/{variantId}/{kind}/
// {chunkId}` string is passed as AES-GCM's `additionalData` (AAD) on both
// encrypt and decrypt. AAD is authenticated but not encrypted — decryption
// fails if the caller's path doesn't match what the token was minted for.
// Without this, a validly-minted token for one media/provider/variant could
// be replayed on a request path claiming a different one: decryption would
// still succeed (it only proves the ciphertext wasn't tampered with) and the
// proxy would fetch one thing while caching and labeling it as another —
// exactly the cache-mislabeling failure this design exists to remove.
import { AppError } from '@/lib/errors';
import type { ResolvedTarget } from './types';

// Local-dev-only fallback so the app works without configuring a secret.
// Deliberately a fixed, publicly-visible string (not a random per-boot
// value): minting happens in a Node process and verification happens in an
// Edge isolate — separate runtimes with no shared memory in production, so
// a random per-boot secret could never agree between the two. This provides
// zero real security and is refused outright in production.
const DEV_FALLBACK_SECRET = 'harustream-dev-insecure-default-secret-do-not-use-in-production';

// How long a minted token stays valid. One value for every token kind (top-
// level media, rewritten sub-manifest, rewritten segment/key) — long enough
// that a multi-hour movie doesn't expire mid-playback, short enough to keep
// a leaked link's window bounded.
export const PLAYBACK_TOKEN_TTL_MS = 6 * 60 * 60 * 1000;

function secret(): string {
  const configured = process.env.STREAM_PROXY_SECRET?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') {
    throw new AppError('CONFIG', 'STREAM_PROXY_SECRET must be set in production');
  }
  return DEV_FALLBACK_SECRET;
}

let cachedKey: Promise<CryptoKey> | undefined;
function cryptoKey(): Promise<CryptoKey> {
  // Deriving the AES key is pure — same secret always yields the same key —
  // so memoizing it is a performance optimization, never a correctness
  // dependency: a process restart or a different isolate simply re-derives
  // the identical key from the same secret.
  cachedKey ??= crypto.subtle
    .digest('SHA-256', new TextEncoder().encode(secret()))
    .then((digest) =>
      crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']),
    );
  return cachedKey;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const withPadding = padded + '='.repeat((4 - (padded.length % 4)) % 4);
  const binary = atob(withPadding);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export interface MintedToken {
  token: string;
  /** Cleartext expiry (unix seconds) — a cheap sync pre-check before the
   *  async decrypt. The authoritative expiry is the one sealed inside the
   *  token; this cleartext copy is a hint only, never trusted for auth. */
  exp: number;
}

export async function mintProxyToken(
  target: Omit<ResolvedTarget, 'exp'>,
  ttlMs: number,
  canonicalPath: string,
): Promise<MintedToken> {
  const exp = Math.floor((Date.now() + ttlMs) / 1000);
  const payload: ResolvedTarget = { ...target, exp };
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aad = new TextEncoder().encode(canonicalPath);
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad },
    await cryptoKey(),
    plaintext,
  );
  const combined = new Uint8Array(iv.length + cipher.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipher), iv.length);
  return { token: toBase64Url(combined), exp };
}

/** Decrypts and authenticates a token against the canonical path it must
 *  have been minted for. Returns null on any failure — tampering, a wrong
 *  path, or genuine expiry — never throws, since a bad token is an expected
 *  client-facing condition (expired link, replayed token), not a bug. */
export async function verifyProxyToken(
  token: string,
  canonicalPath: string,
): Promise<ResolvedTarget | null> {
  try {
    const combined = fromBase64Url(token);
    if (combined.length < 13) return null;
    const iv = combined.slice(0, 12);
    const cipher = combined.slice(12);
    const aad = new TextEncoder().encode(canonicalPath);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: aad },
      await cryptoKey(),
      cipher,
    );
    const payload = JSON.parse(new TextDecoder().decode(plaintext)) as ResolvedTarget;
    if (typeof payload.exp !== 'number' || payload.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

/** Test/dev helper: forces the next call to re-derive the key from the
 *  current secret instead of reusing a memoized one from a previous test. */
export function resetTokenKeyCache(): void {
  cachedKey = undefined;
}
