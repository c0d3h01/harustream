export type MediaKind = 'movie' | 'series';
export type StreamFormat = 'hls' | 'mp4' | 'mkv' | 'other';

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

export interface Subtitle {
  id: string;
  label: string;
  language: string;
  url: string;
  format: 'vtt' | 'srt' | 'ttml';
}

export interface StreamSource {
  id: string;
  providerId: string;
  label: string;
  url: string;
  format: StreamFormat;
  quality?: string;
  headers?: Record<string, string>;
  subtitles: Subtitle[];
  skip?: SkipInterval[];
}

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
