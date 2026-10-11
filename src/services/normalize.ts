import { createHash } from 'node:crypto';
import type { SubtitleFormat } from '@/lib/streaming/types';
import type { RawEpisodeLink, RawInfo, RawPost, RawStream } from '@/providers/_shared';
import type { Episode, Media, MediaGroup, SearchResult, StreamFormat } from '@/types/media';

function stableId(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
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

export function mapPosts(raw: RawPost[], providerId: string, providerName: string): SearchResult[] {
  return raw.map((post) => ({
    id: idFor(providerId, post.link),
    providerId,
    providerName,
    title: post.title,
    displayTitle: displayTitle(post.title),
    posterUrl: post.image || undefined,
    ref: post.link,
  }));
}

export function toMedia(raw: RawInfo, providerId: string, ref: string): Media {
  const groups: MediaGroup[] = raw.linkList.map((link, index) => {
    const items = (link.directLinks ?? []).map((source) => ({
      id: idFor(providerId, source.link),
      label: source.title,
      ref: source.link,
    }));
    return {
      id: `${idFor(providerId, ref)}:group:${index}`,
      label: link.title,
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
    groups,
  };
}

export function toEpisode(raw: RawEpisodeLink, providerId: string): Episode {
  return {
    id: idFor(providerId, raw.link),
    title: raw.title,
    ref: raw.link,
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

interface RawSubtitleTrack {
  id: string;
  label: string;
  language: string;
  format: SubtitleFormat;
  upstreamUrl: string;
}

export interface RawVariant {
  providerId: string;
  variantId: string;
  format: StreamFormat;
  quality?: string;
  label: string;
  skip?: RawStream['skip'];
  upstreamUrl: string;
  subtitles: RawSubtitleTrack[];
}

export function toRawVariant(raw: RawStream, providerId: string): RawVariant {
  const subtitles: RawSubtitleTrack[] = (raw.subtitles ?? []).map((subtitle) => ({
    id: idFor(providerId, subtitle.uri),
    label: subtitle.title,
    language: subtitle.language,
    format: subtitleFormat(subtitle.type),
    upstreamUrl: subtitle.uri,
  }));
  const format = formatOf(raw.type, raw.link);
  return {
    providerId,
    variantId: stableId(`${format}:${raw.quality ?? ''}:${raw.server.trim().toLowerCase()}`),
    label: raw.server,
    format,
    quality: raw.quality,
    skip: raw.skip,
    subtitles,
    upstreamUrl: raw.link,
  };
}

export function orderVariants(variants: RawVariant[]): RawVariant[] {
  const rank = (format: StreamFormat): number => (format === 'hls' ? 0 : format === 'mpd' ? 1 : 2);
  const sorted = [...variants].sort((left, right) => {
    if (rank(left.format) !== rank(right.format)) return rank(left.format) - rank(right.format);
    return (
      (Number(right.quality?.replace('p', '')) || 0) - (Number(left.quality?.replace('p', '')) || 0)
    );
  });
  const seen = new Map<string, number>();
  return sorted.map((variant) => {
    const occurrence = seen.get(variant.variantId) ?? 0;
    seen.set(variant.variantId, occurrence + 1);
    return occurrence === 0
      ? variant
      : { ...variant, variantId: `${variant.variantId}:${occurrence}` };
  });
}
