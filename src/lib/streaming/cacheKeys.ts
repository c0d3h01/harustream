// Deterministic cache key builder. The proxy path itself IS the cache key:
// `{mediaId}/{providerId}/{variantId}/{kind}/{chunkId}`. Two requests for
// the same chunk of the same media/provider always compute an identical
// path, and can never collide with a different media/provider/chunk.
//
// See lib/streaming/README.md for the documented boundary: this guarantees
// per-request determinism and correctness, not cross-user CDN cache sharing
// (Vercel's edge network caches by full URL including query string; the
// per-user token in the query string means two different users' requests
// for "the same" chunk don't share a cache entry there today).

import type { ProxyResourceKind, StreamVariant } from './types';

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Stable id for a chunk (segment, init map, key, or manifest), derived from
 * the upstream URL's origin + pathname only. The query string is excluded
 * deliberately — providers sign it per session, so including it would make
 * the same logical segment hash differently on every resolution and defeat
 * determinism.
 */
export async function chunkIdFor(upstreamUrl: string): Promise<string> {
  const { origin, pathname } = new URL(upstreamUrl);
  const hash = await sha256Hex(`${origin}${pathname}`);
  return hash.slice(0, 16);
}

/** The canonical path string bound into a token's AAD (see token.ts). */
export function canonicalPath(
  mediaId: string,
  providerId: string,
  variantId: string,
  kind: ProxyResourceKind | string,
  chunkId: string,
): string {
  return `${mediaId}/${providerId}/${variantId}/${kind}/${chunkId}`;
}

/** Builds the `/api/proxy/...` href for a variant's chunk. */
export function proxyPath(
  variant: Pick<StreamVariant, 'mediaId' | 'providerId' | 'variantId'>,
  kind: ProxyResourceKind,
  chunkId: string,
): string {
  return [
    '/api/proxy',
    encodeURIComponent(variant.mediaId),
    encodeURIComponent(variant.providerId),
    encodeURIComponent(variant.variantId),
    kind,
    encodeURIComponent(chunkId),
  ].join('/');
}
