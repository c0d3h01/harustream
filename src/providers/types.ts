import type { AxiosInstance } from 'axios';
import type * as cheerio from 'cheerio';
import type { Catalog, SkipInterval } from '@/types';

export type { SkipInterval };

export interface RawPost {
  title: string;
  link: string;
  image?: string;
  provider?: string;
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
  headers?: Record<string, string>;
  skip?: SkipInterval[];
}

export interface RawInfo {
  title: string;
  image?: string;
  poster?: string;
  logo?: string;
  synopsis?: string;
  imdbId?: string;
  tmdbId?: string;
  type: 'movie' | 'series' | string;
  tags?: string[];
  cast?: string[];
  rating?: string;
  linkList: RawLink[];
  webUrl?: string;
}

export interface RawEpisodeLink {
  title: string;
  link: string;
  description?: string;
  image?: string;
  quickDownload?: boolean;
  skip?: SkipInterval[];
}

export interface RawLinkSource {
  title: string;
  link: string;
  type?: 'movie' | 'series';
  description?: string;
  image?: string;
  quickDownload?: boolean;
  skip?: SkipInterval[];
}

export interface RawLink {
  title: string;
  quality?: string;
  episodesLink?: string;
  quickDownload?: boolean;
  directLinks?: RawLinkSource[];
}

export interface ProviderKvStore {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<boolean>;
  keys(): Promise<string[]>;
  clear(): Promise<void>;
}

export interface OpenWebViewOptions {
  title?: string;
  description?: string;
  headers?: Record<string, string>;
  waitForCookie?: string;
  force?: boolean;
  timeoutMs?: number;
}

export interface OpenWebViewResult {
  data: string;
  cookies: string;
  cookieMap: Record<string, string>;
  userAgent: string;
  url: string;
}

export interface ProviderContext {
  axios: AxiosInstance;
  cheerio: typeof cheerio;
  commonHeaders: Record<string, string>;
  kvStore: ProviderKvStore;
  openWebView(url: string, options?: OpenWebViewOptions): Promise<OpenWebViewResult>;
}

export interface ProviderModule {
  readonly id: string;
  readonly name: string;
  readonly kind: ProviderSummaryKind;
  readonly catalog: Catalog[];
  readonly genres: Catalog[];
  readonly searchFilter?: string;
  readonly nonStreamableServer?: string[];
  getPosts(args: {
    filter: string;
    page: number;
    signal?: AbortSignal;
    ctx: ProviderContext;
  }): Promise<RawPost[]>;
  getSearchPosts(args: {
    query: string;
    page: number;
    signal?: AbortSignal;
    ctx: ProviderContext;
  }): Promise<RawPost[]>;
  getMeta(args: { link: string; signal?: AbortSignal; ctx: ProviderContext }): Promise<RawInfo>;
  getEpisodes?(args: {
    url: string;
    signal?: AbortSignal;
    ctx: ProviderContext;
  }): Promise<RawEpisodeLink[]>;
  getStream(args: {
    link: string;
    type: string;
    signal?: AbortSignal;
    ctx: ProviderContext;
  }): Promise<RawStream[]>;
}

export type ProviderSummaryKind = 'movies' | 'anime' | 'india' | 'english' | 'global';

interface SettingsFieldBase {
  key: string;
  label: string;
  description?: string;
}

export type SettingsField =
  | (SettingsFieldBase & {
      type: 'text';
      defaultValue?: string;
      placeholder?: string;
    })
  | (SettingsFieldBase & { type: 'toggle'; defaultValue?: boolean })
  | (SettingsFieldBase & {
      type: 'select';
      options: { label: string; value: string }[];
      defaultValue?: string;
    })
  | (SettingsFieldBase & {
      type: 'multiselect';
      options: { label: string; value: string }[];
      defaultValue?: string[];
    })
  | (SettingsFieldBase & {
      type: 'number';
      defaultValue?: number;
      min?: number;
      max?: number;
    });

export type Post = RawPost;
export type Stream = RawStream;
export type Info = RawInfo;
export type EpisodeLink = RawEpisodeLink;
export type Link = RawLink;
export type TextTracks = RawTextTrack[];
