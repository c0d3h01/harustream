import type { DASHSrc, HLSSrc, PlayerSrc } from '@vidstack/react';
import type { StreamSource } from '@/types';
import type { SubtitleFormat } from './streamProxy';

export type { SubtitleFormat };

export type PlaybackContext = {
  providerId: string;
  ref: string;
  kind: string;
};

// Vidstack only routes to its HLS/DASH providers when the MIME type is
// explicit or the URL ends in .m3u8/.mpd. Proxied URLs do not expose a useful
// extension, so unknown/container formats receive a generic media type rather
// than an incorrect video/mp4 hint.
export function playerSrc(sourceUrl: string, format?: StreamSource['format']): PlayerSrc {
  switch (format) {
    case 'hls':
      return { src: sourceUrl, type: 'application/x-mpegurl' } as HLSSrc;
    case 'mpd':
      return { src: sourceUrl, type: 'application/dash+xml' } as DASHSrc;
    case 'mp4':
      return { src: sourceUrl, type: 'video/mp4' };
    case 'mkv':
      // Keep the container identity explicit so Vidstack selects its native
      // loader and emits a terminal error instead of leaving its spinner up.
      return { src: sourceUrl, type: 'video/x-matroska' } as unknown as PlayerSrc;
    default:
      // Unknown proxied streams must use the generic video loader. A missing
      // type makes Vidstack reject URLs that have no visible file extension.
      return { src: sourceUrl, type: 'video/*' } as unknown as PlayerSrc;
  }
}

const SUPPORTED_HEADERS = ['referer', 'origin', 'userAgent', 'cookie'] as const;

// Optional Cloudflare Worker fronting media streams in production
// (src/proxy/). Unset — e.g. local dev — everything falls back to the
// built-in /api/proxy. Static member access keeps Next's build-time env
// inlining working for the browser bundle.
function workerBase(override?: string): string {
  return (override ?? process.env.NEXT_PUBLIC_STREAM_PROXY_URL ?? '').trim().replace(/\/+$/, '');
}

export function headerParams(headers?: Record<string, string>): URLSearchParams {
  const params = new URLSearchParams();
  if (!headers) return params;
  for (const name of SUPPORTED_HEADERS) {
    const entry = Object.entries(headers).find(
      ([key]) => key.replace(/[-_]/g, '').toLowerCase() === name.replace(/[-_]/g, '').toLowerCase(),
    );
    if (entry?.[1]) params.set(name, entry[1]);
  }
  return params;
}

export type PlaybackSrcHeaders = Partial<
  Record<'referer' | 'origin' | 'userAgent' | 'cookie', string>
>;

/** Flatten a provider header map to the exact keys the proxy contract uses. */
export function playbackHeaderMap(headers?: Record<string, string>): PlaybackSrcHeaders {
  const params = headerParams(headers);
  const map: PlaybackSrcHeaders = {};
  for (const name of SUPPORTED_HEADERS) {
    const value = params.get(name);
    if (value) map[name] = value;
  }
  return map;
}

// Subtitle tracks: small text files (often needing srt/ttml conversion), so
// they always use the built-in /api/proxy regardless of the worker.
export function playbackUrl(
  url: string,
  headers?: Record<string, string>,
  subtitleFormat?: SubtitleFormat,
): string {
  const params = new URLSearchParams({ url });
  for (const [name, value] of headerParams(headers)) params.set(name, value);
  if (subtitleFormat && subtitleFormat !== 'vtt') {
    params.set('subtitleFormat', subtitleFormat);
  }
  return `/api/proxy?${params.toString()}`;
}

// Main media src. DASH manifests are embed-friendly by design (no referer
// checks, open CORS, week-long signatures) so they play directly from the
// viewer's connection with no proxy at all. Everything else streams through
// the Cloudflare worker when configured, else through /api/proxy's
// resolve-and-stream mode which keeps signed URLs off the client entirely.
export function mediaPlaybackUrl(
  source: StreamSource,
  context: PlaybackContext,
  workerUrl?: string,
): string {
  if (source.format === 'mpd') return source.url;
  const base = workerBase(workerUrl);
  if (base) {
    const params = new URLSearchParams({ url: source.url });
    for (const [name, value] of headerParams(source.headers)) params.set(name, value);
    return `${base}/?${params.toString()}`;
  }
  return streamPlaybackUrl(source, context);
}

export function streamPlaybackUrl(source: StreamSource, context: PlaybackContext): string {
  const params = new URLSearchParams({
    provider: context.providerId,
    ref: context.ref,
    kind: context.kind,
    sourceId: source.id,
  });
  return `/api/proxy?${params.toString()}`;
}
