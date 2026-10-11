import { encodeBase64Url } from './base64url';

/**
 * Provider artwork is often referer-protected, so it goes through the
 * SSRF-guarded image route instead of loading straight from the source host.
 */
export function imgUrl(src: string | null | undefined): string {
  if (!src) return '';
  if (src.startsWith('/')) return src;
  return `/api/image/${encodeBase64Url(src)}`;
}
