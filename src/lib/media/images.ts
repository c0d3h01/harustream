// Client-side artwork URL helper. Every next/image in the app loads artwork
// through the SSRF-guarded /api/image proxy so the Next.js optimizer can
// resize any provider-hosted poster without CORS or referer concerns.
//
// The upstream URL is base64url-encoded as a path segment (not a query
// string) — that keeps the optimizer's src free of a query string, so it
// never needs a localPatterns entry and plain local assets like
// /favicon/icon.png keep working alongside it.

export function imageUrl(src: string | null | undefined): string {
  if (!src) return '';
  if (src.startsWith('/')) return src;
  return `/api/image/${encodeImageUrl(src)}`;
}

// Base64url-encode an upstream URL as a path segment. The `/` in base64
// would otherwise be interpreted as a path separator by the route.
export function encodeImageUrl(src: string): string {
  return Buffer.from(src, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
