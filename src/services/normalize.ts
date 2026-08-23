import type { RawEpisodeLink, RawInfo, RawPost, RawStream } from '@/providers/types';
import type {
  Episode,
  Media,
  MediaGroup,
  MediaGroupItem,
  SearchResult,
  StreamFormat,
  StreamSource,
  Subtitle,
} from '@/types';

function stableId(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function idFor(providerId: string, ref: string): string {
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
  if (lowerType === 'mp4' || cleanUrl.endsWith('.mp4')) return 'mp4';
  if (lowerType === 'mkv' || cleanUrl.endsWith('.mkv')) return 'mkv';
  return 'other';
}

function subtitleFormat(type: Subtitle['format'] | string): Subtitle['format'] {
  if (type.includes('ttml')) return 'ttml';
  if (type.includes('subrip') || type.includes('srt')) return 'srt';
  return 'vtt';
}

export function toStreamSource(raw: RawStream, providerId: string): StreamSource {
  const subtitles = (raw.subtitles ?? []).map((subtitle) => ({
    id: idFor(providerId, subtitle.uri),
    label: subtitle.title,
    language: subtitle.language,
    url: subtitle.uri,
    format: subtitleFormat(subtitle.type),
  }));
  return {
    id: idFor(providerId, raw.link),
    providerId,
    label: raw.server,
    url: raw.link,
    format: formatOf(raw.type, raw.link),
    quality: raw.quality,
    headers: raw.headers,
    subtitles,
    skip: raw.skip,
  };
}

export function orderSources(sources: StreamSource[]): StreamSource[] {
  return [...sources].sort((left, right) => {
    if (left.format === 'hls' && right.format !== 'hls') return -1;
    if (left.format !== 'hls' && right.format === 'hls') return 1;
    return (
      (Number(right.quality?.replace('p', '')) || 0) - (Number(left.quality?.replace('p', '')) || 0)
    );
  });
}
