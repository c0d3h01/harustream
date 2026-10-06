import type { SkipInterval } from '@/types/media';

export type { SkipInterval };

export interface ProviderUrlsEntry {
  name: string;
  url: string;
  /**
   * Host patterns the stream proxy may fetch for this provider. `*` matches one
   * label (`*.cdn.to`), `*.*` matches any depth. Anything else is an exact host.
   * The provider's own site and its subdomains are always allowed.
   */
  upstreamHosts?: string[];
}

export type ProviderUrls = Record<string, ProviderUrlsEntry>;

export interface RawPost {
  title: string;
  link: string;
  image?: string;
}

export type RawTextTrack = {
  title: string;
  language: string;
  type: 'application/x-subrip' | 'application/ttml+xml' | 'text/vtt';
  uri: string;
};

export interface RawStream {
  server: string;
  link: string;
  type: string;
  quality?: string;
  subtitles?: RawTextTrack[];
  skip?: SkipInterval[];
}

export interface RawInfo {
  title: string;
  image?: string;
  poster?: string;
  synopsis?: string;
  imdbId?: string;
  type: 'movie' | 'series' | string;
  tags?: string[];
  rating?: string;
  linkList: RawLink[];
}

export interface RawEpisodeLink {
  title: string;
  link: string;
  skip?: SkipInterval[];
}

export interface RawLinkSource {
  title: string;
  link: string;
}

export interface RawLink {
  title: string;
  episodesLink?: string;
  directLinks?: RawLinkSource[];
}

export interface ProviderModule {
  readonly id: string;
  readonly name: string;
  getSearchPosts?(args: { query: string; page: number; signal?: AbortSignal }): Promise<RawPost[]>;
  getMeta(args: { link: string; signal?: AbortSignal }): Promise<RawInfo>;
  getEpisodes?(args: { url: string; signal?: AbortSignal }): Promise<RawEpisodeLink[]>;
  getStream(args: { link: string; type: string; signal?: AbortSignal }): Promise<RawStream[]>;
}
