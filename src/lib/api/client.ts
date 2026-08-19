// Browser-side fetchers. Always call same-origin /api/* — never the upstream
// provider, since the provider does not return CORS headers and a direct
// browser call would be blocked.

import { getAvailableProviders } from '../state/providers';
import { describeProviderError, ProviderError } from './errors';
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

export { getAvailableProviders, providerById } from '../state/providers';
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

// Retry once after a short backoff for transient upstream failures (cold
// start, function reclaim). A retry only helps when the first attempt died
// fast — retrying a 20s timeout doubles the user's wait and re-runs the same
// dead upstream, so slow failures are never retried. 4xx and network errors
// are not retried either.
const RETRY_STATUSES = new Set([502, 503, 504]);
const RETRY_DELAY_MS = 1_000;
const FAST_FAIL_MS = 3_000;

// Per-call cap matching the provider runtime timeout (20s): a provider module
// that hangs is cut off at the same moment server-side, and every stream/
// episode/meta call is individually bounded so one dead provider can't wedge
// the UI.
const CALL_TIMEOUT_MS = 20_000;
// Overall budget for walking provider×hub candidates: after this, further
// attempts are pointless — surface a clear timeout instead of hanging.
const RESOLVE_BUDGET_MS = 60_000;

function withCallTimeout(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(CALL_TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

// buildParams omits empty values so the route handlers never see `param=`
// (they treat an empty value as missing).
function buildParams(entries: Record<string, string>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(entries)) {
    if (value) params.set(key, value);
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  const started = performance.now();
  let response: Response;
  try {
    response = await fetch(path, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new ApiError(504, 'The streaming source timed out.', 'TIMEOUT', undefined);
    }
    throw new ApiError(0, 'Network error — check your connection.', 'NETWORK', undefined);
  }

  const requestId = response.headers.get('x-request-id') ?? undefined;

  if (!response.ok) {
    const elapsed = performance.now() - started;
    if (RETRY_STATUSES.has(response.status) && elapsed < FAST_FAIL_MS && !signal?.aborted) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      try {
        response = await fetch(path, {
          headers: { Accept: 'application/json' },
          cache: 'no-store',
          signal,
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'TimeoutError') {
          throw new ApiError(504, 'The streaming source timed out.', 'TIMEOUT', undefined);
        }
        throw new ApiError(0, 'Network error — check your connection.', 'NETWORK', undefined);
      }
    }
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

export const getCategories = (provider: string = '', signal?: AbortSignal) =>
  request<unknown>(`/api/catalog${buildParams({ provider })}`, signal).then((data) =>
    CategorySchema.array().parse(data),
  );

// --- Search ---

// Without a provider the server fans out across every live provider, merges
// the results, and annotates each item with its sources. With a provider only
// that provider is searched.
export const searchCatalog = (query: string, provider: string = '', signal?: AbortSignal) => {
  const params = buildParams({ q: query, provider });
  return request<unknown>(`/api/search${params}`, signal).then((data) =>
    MediaSchema.array().parse(data),
  ) as Promise<Media[]>;
};

// --- Featured home feed ---

// /api/featured builds four rails (featured, newest, movies, series) by
// executing the providers' own modules — either a single provider's catalog
// (with `provider`) or a server-side fan-out across all of them (default).
export type FeaturedFeed = {
  featured: Media[];
  newest: Media[];
  movies: Media[];
  series: Media[];
};

// The client no longer fans out: home is aggregated server-side. The
// preferred provider id only reorders the merged rails so the default
// channel's content leads.
export const getFeatured = (preferred: string = '', signal?: AbortSignal) =>
  request<unknown>(`/api/featured${buildParams({ preferred })}`, signal) as Promise<FeaturedFeed>;

// --- Meta ---

// The provider link travels as the `link` query param: provider links are
// relative URLs full of slashes, which are fragile inside URL paths. The
// handler also accepts the legacy path form for backward compatibility.
export const getMeta = (link: string, provider: string = '', signal?: AbortSignal) =>
  request<unknown>(`/api/media${buildParams({ link, provider })}`, withCallTimeout(signal)).then(
    (data) => MetaSchema.parse(data),
  ) as Promise<Meta>;

// --- Episodes ---

export const getEpisodes = (link: string, provider: string = '', signal?: AbortSignal) =>
  request<unknown>(
    `/api/media/episodes${buildParams({ link, provider })}`,
    withCallTimeout(signal),
  ).then((data) => EpisodeSchema.array().parse(data)) as Promise<Episode[]>;

// --- Stream ---

// Pass a hub URL extracted from `meta.linkList[].directLinks[0].link` (or
// `episodesLink` for series). The route handler forwards to the upstream
// which extracts the actual playable m3u8/mp4 URLs.
export const getStream = (hubUrl: string, type = 'movie', provider: string = '') => {
  const params = buildParams({ hub: hubUrl, type, provider });
  return request<unknown>(`/api/stream${params}`, withCallTimeout()).then((data) =>
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
  for (const p of getAvailableProviders()) push(p.id);
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
// candidate has been exhausted. The winning hub is returned so the caller can
// mark it failed if the stream later turns out unplayable.
export async function resolveMovieStream(
  meta: Pick<Meta, 'linkList'>,
  preferredProvider: string = '',
): Promise<{ stream: Stream; hub: string }> {
  const candidates = hubCandidates(meta);
  const providers = providerCandidates(preferredProvider);
  const attempts: string[] = [];
  const started = performance.now();
  let lastError: unknown;

  for (const provider of providers) {
    for (const hub of candidates) {
      if (performance.now() - started > RESOLVE_BUDGET_MS) {
        throw new ProviderError(
          504,
          `Streaming timed out after ${Math.round(RESOLVE_BUDGET_MS / 1000)}s — the sources are slow or unreachable right now.`,
          undefined,
          'TIMEOUT',
        );
      }
      if (streamRecentlyFailed(provider, 'movie', hub)) {
        attempts.push(`${provider}:${hub}`);
        continue;
      }
      try {
        const stream = await getStream(hub, 'movie', provider);
        if (stream && stream.length > 0) return { stream, hub };
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
// dead episode hub cannot block playback of the series. The winning episode
// is returned so the caller can mark it failed if playback turns out broken.
export async function getStreamFallback(
  episodes: { link: string; title: string }[],
  provider: string = '',
): Promise<{ stream: Stream; episode: { link: string; title: string } }> {
  let lastError: unknown;
  const started = performance.now();
  for (const episode of episodes) {
    if (performance.now() - started > RESOLVE_BUDGET_MS) {
      throw new ProviderError(
        504,
        `Streaming timed out after ${Math.round(RESOLVE_BUDGET_MS / 1000)}s — the sources are slow or unreachable right now.`,
        undefined,
        'TIMEOUT',
      );
    }
    if (streamRecentlyFailed(provider, 'series', episode.link)) continue;
    try {
      const stream = await getStream(episode.link, 'series', provider);
      if (stream && stream.length > 0) return { stream, episode };
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
  provider: string = '',
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

  const started = performance.now();
  for (const hub of hubs) {
    if (performance.now() - started > RESOLVE_BUDGET_MS) return [];
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
