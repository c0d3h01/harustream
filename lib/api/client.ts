// Browser-side fetchers. Always call same-origin /api/* — never the upstream
// provider, since the provider does not return CORS headers and a direct
// browser call would be blocked.

import { describeProviderError, ProviderError } from './errors';
import { DEFAULT_PROVIDER_ID, PROVIDERS } from './providers';
import {
  CategorySchema,
  type Episode,
  EpisodeSchema,
  type Media,
  MediaSchema,
  type Meta,
  MetaSchema,
  type Stream,
  StreamSchema,
  sortLinkListByQuality,
} from './types';

export { DEFAULT_PROVIDER_ID, isValidProvider, PROVIDERS, providerById } from './providers';
export type { Category, Episode, Media, Meta, Stream } from './types';
export {
  imageFor,
  pickBestHubUrl,
  pickHubUrl,
  resolveStream,
  shortTitleFor,
  sortLinkListByQuality,
  titleFor,
} from './types';

// Server error responses all share { error, code?, requestId? }. We surface
// the human-readable message so the UI can show exactly why a request failed.
export class ApiError extends Error {
  readonly code?: string;
  readonly requestId?: string;
  readonly status: number;

  constructor(status: number, message: string, code?: string, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

async function request<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
  } catch (_error) {
    throw new ApiError(0, 'Network error — check your connection.', 'NETWORK', undefined);
  }

  const requestId = response.headers.get('x-request-id') ?? undefined;

  if (!response.ok) {
    // Parse the shared error envelope when present; otherwise fall back to a
    // status-based generic message.
    const body = (await response
      .clone()
      .json()
      .catch(() => null)) as { error?: string; code?: string; requestId?: string } | null;
    throw new ApiError(
      response.status,
      body?.error ?? `Request failed (${response.status})`,
      body?.code,
      body?.requestId ?? requestId,
    );
  }
  return (await response.json()) as T;
}

// Rewrites unknown errors into a user-safe message (keeps the `error` field
// intact for providers, which already carry readable copy).
export function safeErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return describeProviderError(error);
}

// --- Catalog ---

export const getCategories = (provider: string = DEFAULT_PROVIDER_ID) =>
  request<unknown>(`/api/catalog?provider=${encodeURIComponent(provider)}`).then((data) =>
    CategorySchema.array().parse(data),
  );

// --- Search ---

export const searchCatalog = (query: string, provider: string = DEFAULT_PROVIDER_ID) => {
  const params = new URLSearchParams({ q: query, provider });
  return request<unknown>(`/api/search?${params.toString()}`).then((data) =>
    MediaSchema.array().parse(data),
  ) as Promise<Media[]>;
};

// --- Featured home feed ---

// /api/featured fans out into the upstream with movie-focused and series-
// focused queries, deduplicates, and returns four rails: featured, newest,
// movies, series.
export type FeaturedFeed = {
  featured: Media[];
  newest: Media[];
  movies: Media[];
  series: Media[];
};

export const getFeatured = (provider: string = DEFAULT_PROVIDER_ID) =>
  request<unknown>(
    `/api/featured?provider=${encodeURIComponent(provider)}`,
  ) as Promise<FeaturedFeed>;

// --- Meta ---

export const getMeta = (link: string, provider: string = DEFAULT_PROVIDER_ID) =>
  request<unknown>(
    `/api/media/${encodeURIComponent(link)}?provider=${encodeURIComponent(provider)}`,
  ).then((data) => MetaSchema.parse(data)) as Promise<Meta>;

// --- Episodes ---

export const getEpisodes = (link: string, provider: string = DEFAULT_PROVIDER_ID) =>
  request<unknown>(
    `/api/media/${encodeURIComponent(link)}/episodes?provider=${encodeURIComponent(provider)}`,
  ).then((data) => EpisodeSchema.array().parse(data)) as Promise<Episode[]>;

// --- Stream ---

// Pass a hub URL extracted from `meta.linkList[].directLinks[0].link` (or
// `episodesLink` for series). The route handler forwards to the upstream
// which extracts the actual playable m3u8/mp4 URLs.
export const getStream = (
  hubUrl: string,
  type = 'movie',
  provider: string = DEFAULT_PROVIDER_ID,
) => {
  const params = new URLSearchParams({ hub: hubUrl, type, provider });
  return request<unknown>(`/api/stream?${params.toString()}`).then((data) =>
    StreamSchema.parse(data),
  ) as Promise<Stream>;
};

// --- Resilient stream resolution -------------------------------------------

// Negative-result cache: a (provider, hub, type) tuple that failed (timeout,
// empty, error) is remembered for a short window so a user hitting play again
// is not forced to re-wait the full upstream timeout on the same dead link.
// Keyed by provider|type|hub.
const failedStreamCache = new Map<string, number>();
const STREAM_FAIL_TTL_MS = 30_000;

function streamCacheKey(provider: string, type: string, link: string): string {
  return `${provider}|${type}|${link}`;
}

function rememberStreamFailure(provider: string, type: string, link: string) {
  failedStreamCache.set(streamCacheKey(provider, type, link), Date.now() + STREAM_FAIL_TTL_MS);
}

export { rememberStreamFailure };

function streamRecentlyFailed(provider: string, type: string, link: string): boolean {
  const deadline = failedStreamCache.get(streamCacheKey(provider, type, link));
  return !!deadline && deadline > Date.now();
}

// Ordered candidate list of providers to try for a title: the preferred
// provider first, then the others (so a single slow/broken provider can't
// block playback).
function providerCandidates(preferred: string): string[] {
  const seen = new Set<string>();
  const list: string[] = [];
  const push = (id: string) => {
    if (id && !seen.has(id)) {
      seen.add(id);
      list.push(id);
    }
  };
  push(preferred);
  for (const p of PROVIDERS) push(p.id);
  return list;
}

// Ordered candidate hubs for a movie: every quality entry's direct link (best
// quality first). If the best link hangs, the next quality may still resolve.
function hubCandidates(meta: Pick<Meta, 'linkList'>): string[] {
  const seen = new Set<string>();
  const list: string[] = [];
  const push = (hub: string | undefined) => {
    const h = hub?.trim();
    if (h && !seen.has(h)) {
      seen.add(h);
      list.push(h);
    }
  };
  for (const entry of sortLinkListByQuality(meta.linkList)) {
    push(entry.directLinks?.[0]?.link ?? undefined);
  }
  return list;
}

// Tries to resolve a playable stream for a movie, walking the quality hubs of
// the preferred provider and then falling back to the other registered
// providers. Every candidate is remembered on failure so a retry skips dead
// links immediately. Throws a descriptive ProviderError only when every
// candidate has been exhausted.
export async function resolveMovieStream(
  meta: Pick<Meta, 'linkList'>,
  preferredProvider: string = DEFAULT_PROVIDER_ID,
): Promise<Stream> {
  const candidates = hubCandidates(meta);
  const providers = providerCandidates(preferredProvider);
  const attempts: string[] = [];
  let lastError: unknown;

  for (const provider of providers) {
    for (const hub of candidates) {
      if (streamRecentlyFailed(provider, 'movie', hub)) {
        attempts.push(`${provider}:${hub}`);
        continue;
      }
      try {
        const stream = await getStream(hub, 'movie', provider);
        if (stream && stream.length > 0) return stream;
        attempts.push(`${provider}:${hub}`);
        rememberStreamFailure(provider, 'movie', hub);
      } catch (error) {
        lastError = error;
        attempts.push(`${provider}:${hub}`);
        rememberStreamFailure(provider, 'movie', hub);
      }
    }
  }

  throw new ProviderError(
    504,
    `No playable stream was found after trying ${attempts.length} source${attempts.length === 1 ? '' : 's'}. ${
      describeProviderError(lastError) || 'The streaming source did not return a stream.'
    }`,
    undefined,
    'NO_SOURCE',
  );
}

// Tries the given episode links in order (same provider) so a single slow or
// dead episode hub cannot block playback of the series.
export async function getStreamFallback(
  episodes: { link: string }[],
  provider: string = DEFAULT_PROVIDER_ID,
): Promise<Stream> {
  let lastError: unknown;
  for (const episode of episodes) {
    if (streamRecentlyFailed(provider, 'series', episode.link)) continue;
    try {
      const stream = await getStream(episode.link, 'series', provider);
      if (stream && stream.length > 0) return stream;
      rememberStreamFailure(provider, 'series', episode.link);
    } catch (error) {
      lastError = error;
      rememberStreamFailure(provider, 'series', episode.link);
    }
  }
  throw new ProviderError(
    504,
    `No playable stream was found for this series. ${
      describeProviderError(lastError) || 'The streaming source did not return a stream.'
    }`,
    undefined,
    'NO_SOURCE',
  );
}

// --- Series episode resolution ---

// Providers model series two ways: some expose an `episodesLink` per quality
// entry that /api/episodes can resolve straight into per-episode links;
// others (season-pack catalogs) expose a *page* link instead, whose own meta
// then lists the `episodesLink` hubs. Resolve recursively, honouring a
// preferred hub (the season picked in the detail modal) and preferring the
// best-quality entry so a user can actually start watching.
export async function resolveSeriesEpisodes(
  meta: Pick<Meta, 'linkList'>,
  provider: string = DEFAULT_PROVIDER_ID,
  preferredHub?: string,
  depth = 0,
): Promise<Episode[]> {
  const hubs: string[] = [];
  const seen = new Set<string>();
  const push = (hub: string | undefined) => {
    const h = hub?.trim();
    if (h && !seen.has(h)) {
      seen.add(h);
      hubs.push(h);
    }
  };
  if (preferredHub) push(preferredHub);
  for (const entry of sortLinkListByQuality(meta.linkList)) {
    push(entry.directLinks?.[0]?.link ?? undefined);
    push(entry.episodesLink ?? undefined);
  }

  for (const hub of hubs) {
    const episodes = await getEpisodes(hub, provider).catch(() => []);
    if (episodes.length > 0) return episodes;
    // The hub may be a season/pack *page* rather than an episodes hub.
    // Fetch its meta and descend one level to find episodesLink entries.
    if (depth < 2) {
      const nested = await getMeta(hub, provider).catch(() => null);
      if (nested?.linkList?.length) {
        const nestedEpisodes = await resolveSeriesEpisodes(nested, provider, undefined, depth + 1);
        if (nestedEpisodes.length > 0) return nestedEpisodes;
      }
    }
  }
  return [];
}
