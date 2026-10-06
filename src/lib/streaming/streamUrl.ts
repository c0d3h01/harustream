import { decodeBase64Url, encodeBase64Url } from '@/lib/base64url';
import type { SubtitleFormat } from './types';

const STREAM_PATH = '/api/stream';

/**
 * A playback URL the browser can hand straight to a media engine. The upstream
 * target travels in the path (not the query) so manifest children resolve
 * correctly, and the provider id selects the allowed host set and headers.
 */
export function streamHref(
  providerId: string,
  upstreamUrl: string,
  subtitleFormat?: Exclude<SubtitleFormat, 'vtt'>,
): string {
  const path = `${STREAM_PATH}/${encodeURIComponent(providerId)}/${encodeBase64Url(upstreamUrl)}`;
  return subtitleFormat ? `${path}?format=${subtitleFormat}` : path;
}

export interface StreamRequest {
  providerId: string;
  upstreamUrl: string;
  format?: Exclude<SubtitleFormat, 'vtt'>;
}

export function parseStreamPath(
  segments: string[],
  requestedFormat: string | null,
): StreamRequest | null {
  const parts = segments.filter((segment) => segment.length > 0);
  if (parts.length < 2) return null;
  const [providerId, encoded, ...rest] = parts;
  if (!providerId || !encoded) return null;
  const format =
    requestedFormat === 'srt' || requestedFormat === 'ttml' ? requestedFormat : undefined;
  try {
    const base = decodeBase64Url(encoded);
    if (rest.length === 0) return { providerId, upstreamUrl: base, format };
    // Rejects anything that could escape the signed base directory: traversal,
    // embedded separators, or a protocol-relative segment that would silently
    // re-point the fetch at another origin.
    const decoded = rest.map((segment) => decodeURIComponent(segment));
    for (const segment of decoded) {
      if (!segment || segment === '.' || segment === '..' || /[/\\]/.test(segment)) {
        throw new Error('Invalid segment path');
      }
    }
    const url = new URL(base);
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/${decoded.join('/')}`;
    return { providerId, upstreamUrl: url.toString(), format };
  } catch {
    return null;
  }
}
