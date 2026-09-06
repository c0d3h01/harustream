import type { SubtitleFormat } from '@/lib/streaming/types';
import type { RawEpisodeLink, RawInfo, RawPost, RawStream } from '@/providers/_shared';
import type {
  Episode,
  Media,
  MediaGroup,
  MediaGroupItem,
  SearchResult,
  StreamFormat,
} from '@/types';

function stableId(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function idFor(providerId: string, ref: string): string {
  return `${providerId}:${stableId(`${providerId}:${ref}`)}`;
}

const DISPLAY_NOISE =
  /\s+(?:dual\s+audio|multi\s+audio|blu-?ray|web-?dl|webrip|hdtv|hdrip|proper|repack|x264|x265|hevc|h264|aac|dts|ddp?\s*\d*(?:\.\d+)?|10bit|extended|uncut|complete|full\s+movie|free\s+download)\b.*$/i;
const DISPLAY_SIZE_OR_QUALITY = /\s+(?:\d{3,4}p|\d+(?:\.\d+)?\s*(?:gb|mb)|\d+\s*(?:gb|mb))\b.*$/i;

export function displayTitle(rawTitle: string): string {
  let title = rawTitle.trim().replace(/^download\s+/i, '');
  title = title.replace(/\s*\|\|.*$/u, '');
  title = title.replace(DISPLAY_NOISE, '');
  title = title.replace(DISPLAY_SIZE_OR_QUALITY, '');
  return title.replace(/\s{2,}/g, ' ').trim() || rawTitle.trim();
}

export function toSearchResult(
  raw: RawPost,
  providerId: string,
  providerName: string,
): SearchResult {
  return {
    id: idFor(providerId, raw.link),
    providerId,
    providerName,
    title: raw.title,
    displayTitle: displayTitle(raw.title),
    posterUrl: raw.image || undefined,
    ref: raw.link,
  };
}

function groupItem(
  providerId: string,
  source: NonNullable<NonNullable<RawInfo['linkList']>[number]['directLinks']>[number],
): MediaGroupItem {
  return {
    id: idFor(providerId, source.link),
    label: source.title,
    ref: source.link,
    kind: source.type,
    description: source.description,
    thumbnailUrl: source.image,
  };
}

export function toMedia(raw: RawInfo, providerId: string, ref: string): Media {
  const groups: MediaGroup[] = raw.linkList.map((link, index) => {
    const items = (link.directLinks ?? []).map((source) => groupItem(providerId, source));
    return {
      id: `${idFor(providerId, ref)}:group:${index}`,
      label: link.title,
      quality: link.quality || undefined,
      kind: link.episodesLink ? 'episodes' : 'direct',
      ref: link.episodesLink,
      items,
    };
  });
  return {
    id: idFor(providerId, ref),
    providerId,
    ref,
    title: raw.title,
    displayTitle: displayTitle(raw.title),
    kind: raw.type.toLowerCase() === 'series' ? 'series' : 'movie',
    posterUrl: raw.image || raw.poster || undefined,
    synopsis: raw.synopsis || '',
    imdbId: raw.imdbId || undefined,
    rating: raw.rating || undefined,
    tags: raw.tags ?? [],
    webUrl: raw.webUrl,
    groups,
  };
}

export function toEpisode(raw: RawEpisodeLink, providerId: string, season?: number): Episode {
  const seasonNumber = raw.title.match(/\bS(?:eason)?\s*0*(\d+)/i)?.[1];
  const episodeNumber = raw.title.match(/\bE(?:pisode|p)?\s*0*(\d+)/i)?.[1];
  const fallbackNumber = raw.title.match(/(?:episode|ep|e)\s*\.?\s*(\d+)/i)?.[1];
  const number = episodeNumber
    ? Number(episodeNumber)
    : fallbackNumber
      ? Number(fallbackNumber)
      : undefined;
  return {
    id: idFor(providerId, raw.link),
    title: raw.title,
    season: seasonNumber ? Number(seasonNumber) : season,
    number,
    ref: raw.link,
    description: raw.description,
    thumbnailUrl: raw.image,
    skip: raw.skip,
  };
}

function formatOf(type: string, url: string): StreamFormat {
  const lowerType = type.toLowerCase();
  const cleanUrl = url.split('?', 1)[0].toLowerCase();
  if (lowerType === 'm3u8' || lowerType === 'hls' || cleanUrl.endsWith('.m3u8')) {
    return 'hls';
  }
  if (lowerType === 'mpd' || lowerType === 'dash' || cleanUrl.endsWith('.mpd')) return 'mpd';
  if (lowerType === 'mp4' || cleanUrl.endsWith('.mp4')) return 'mp4';
  if (lowerType === 'mkv' || cleanUrl.endsWith('.mkv')) return 'mkv';
  return 'other';
}

function subtitleFormat(type: SubtitleFormat | string): SubtitleFormat {
  if (type.includes('ttml')) return 'ttml';
  if (type.includes('subrip') || type.includes('srt')) return 'srt';
  return 'vtt';
}

/** A subtitle track before its proxy href is minted (Node-only step, done
 *  in services/sources.ts where the signing secret lives). */
export interface RawSubtitleTrack {
  id: string;
  label: string;
  language: string;
  format: SubtitleFormat;
  upstreamUrl: string;
}

/** A stream variant before its proxy href is minted. Carries the raw
 *  upstream URL server-side only — normalize.ts never builds a client-
 *  facing href, that's `services/sources.ts`'s job once it has the token
 *  secret available. */
export interface RawVariant {
  mediaId: string;
  providerId: string;
  variantId: string;
  format: StreamFormat;
  quality?: string;
  label: string;
  headers?: Record<string, string>;
  skip?: RawStream['skip'];
  upstreamUrl: string;
  subtitles: RawSubtitleTrack[];
}

// Provider CDNs don't just re-sign the query string on every resolution —
// several (vega's hubcloud/filepress, anikoto's vidtube/megaplay) mint a
// fresh session token INSIDE the URL path itself. There is no query/path
// split that survives that across providers, so URL-based identity is
// fundamentally unsound: `variantId` must come from what the provider
// declares about a stream (format + quality + server label), not from its
// URL. This is naturally stable across re-scrapes as long as the
// provider's own server list is unchanged; `orderVariants` disambiguates
// same-label duplicates within one list via their stable sort position. It
// does not need a providerId prefix — `providerId` is carried as its own
// field on `RawVariant`/`StreamVariant`.
function variantIdFor(format: StreamFormat, quality: string | undefined, server: string): string {
  return stableId(`${format}:${quality ?? ''}:${server.trim().toLowerCase()}`);
}

export function toRawVariant(raw: RawStream, providerId: string, mediaId: string): RawVariant {
  const subtitles: RawSubtitleTrack[] = (raw.subtitles ?? []).map((subtitle) => ({
    id: idFor(providerId, subtitle.uri),
    label: subtitle.title,
    language: subtitle.language,
    format: subtitleFormat(subtitle.type),
    upstreamUrl: subtitle.uri,
  }));
  const format = formatOf(raw.type, raw.link);
  return {
    mediaId,
    providerId,
    variantId: variantIdFor(format, raw.quality, raw.server),
    label: raw.server,
    format,
    quality: raw.quality,
    headers: raw.headers,
    subtitles,
    skip: raw.skip,
    upstreamUrl: raw.link,
  };
}

export function orderVariants(variants: RawVariant[]): RawVariant[] {
  const rank = (format: StreamFormat): number => (format === 'hls' ? 0 : format === 'mpd' ? 1 : 2);
  const sorted = [...variants].sort((left, right) => {
    // Adaptive formats lead: one manifest covers all renditions, so first
    // paint and failover stay on a single proxied URL.
    if (rank(left.format) !== rank(right.format)) return rank(left.format) - rank(right.format);
    return (
      (Number(right.quality?.replace('p', '')) || 0) - (Number(left.quality?.replace('p', '')) || 0)
    );
  });
  // variantIds collide when a provider lists two options under the same
  // label/quality/format (e.g. Torrentio's shared 'Torrentio' server name).
  // Disambiguate by this stable sort position — deterministic because Array
  // sort is stable and the provider's own emission order doesn't change
  // between resolutions of the same content.
  const seen = new Map<string, number>();
  return sorted.map((variant) => {
    const occurrence = seen.get(variant.variantId) ?? 0;
    seen.set(variant.variantId, occurrence + 1);
    return occurrence === 0
      ? variant
      : { ...variant, variantId: `${variant.variantId}:${occurrence}` };
  });
}
