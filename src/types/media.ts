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

export interface MediaGroup {
  id: string;
  label: string;
  kind: 'direct' | 'episodes';
  ref?: string;
  items: { id: string; label: string; ref: string }[];
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
  ref: string;
  skip?: SkipInterval[];
}
