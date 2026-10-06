import type { z } from 'zod';
import type {
  rawEpisodeSchema,
  rawInfoSchema,
  rawPostSchema,
  rawStreamSchema,
} from '@/validations/provider';

export type { SkipInterval } from '@/types/media';

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

export type RawPost = z.input<typeof rawPostSchema>;

export type RawStream = z.input<typeof rawStreamSchema>;

export type RawTextTrack = NonNullable<RawStream['subtitles']>[number];

export type RawInfo = z.input<typeof rawInfoSchema>;

export type RawLink = RawInfo['linkList'][number];

export type RawLinkSource = NonNullable<RawLink['directLinks']>[number];

export type RawEpisodeLink = z.input<typeof rawEpisodeSchema>;

export interface ProviderModule {
  readonly id: string;
  readonly name: string;
  getSearchPosts?(args: { query: string; page: number; signal?: AbortSignal }): Promise<RawPost[]>;
  getMeta(args: { link: string; signal?: AbortSignal }): Promise<RawInfo>;
  getEpisodes?(args: { url: string; signal?: AbortSignal }): Promise<RawEpisodeLink[]>;
  getStream(args: { link: string; type: string; signal?: AbortSignal }): Promise<RawStream[]>;
}
