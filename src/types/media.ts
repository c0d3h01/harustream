export type MediaKind = 'movie' | 'series';
export type StreamFormat = 'hls' | 'mpd' | 'mp4' | 'mkv' | 'other';

export interface SearchResult {
  id: string;
  providerId: string;
  providerName: string;
  title: string;
  displayTitle: string;
  posterUrl?: string;
  ref: string;
}

export interface MediaGroupItem {
  id: string;
  label: string;
  ref: string;
  kind?: MediaKind;
  description?: string;
  thumbnailUrl?: string;
}

export interface MediaGroup {
  id: string;
  label: string;
  quality?: string;
  kind: 'direct' | 'episodes';
  ref?: string;
  items: MediaGroupItem[];
}

export interface Media {
  id: string;
  providerId: string;
  ref: string;
  title: string;
  displayTitle: string;
  kind: MediaKind;
  posterUrl?: string;
  synopsis: string;
  imdbId?: string;
  rating?: string;
  tags: string[];
  webUrl?: string;
  groups: MediaGroup[];
}

export interface SkipInterval {
  title?: string;
  from: number;
  to: number;
}

export interface Episode {
  id: string;
  title: string;
  season?: number;
  number?: number;
  ref: string;
  description?: string;
  thumbnailUrl?: string;
  skip?: SkipInterval[];
}

// StreamVariant/SubtitleTrack live in lib/streaming/types.ts (they're the
// streaming subsystem's domain model, keyed by the explicit
// (mediaId, providerId, variantId) triple) and are re-exported here so
// existing call sites can keep importing playback types from '@/types'
// alongside Media/Episode/SearchResult.
export type { StreamVariant, SubtitleTrack } from '@/lib/streaming/types';

export interface Catalog {
  title: string;
  filter: string;
}

export interface ProviderSummary {
  id: string;
  name: string;
  kind: 'movies' | 'anime' | 'india' | 'english' | 'global';
  catalogs: Catalog[];
  hasEpisodes: boolean;
}

export interface FeaturedRail {
  title: string;
  items: SearchResult[];
}
