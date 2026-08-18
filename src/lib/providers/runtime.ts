// High-level provider operations used by the API routes. Each operation
// resolves the provider's module dir from the live manifest, executes the
// matching dist/ module in the vm sandbox, and normalizes the result into
// the shapes the app's API contract defines.
//
// Fan-out endpoints (/api/search, /api/featured without a provider) spread
// work across every executable provider with bounded concurrency and an
// overall deadline; failures degrade per-provider instead of failing the
// whole response.

import { ProviderError } from '@/lib/api/errors';
import { PROVIDER_CONCURRENCY, PROVIDER_DEADLINE_MS, PROVIDER_TIMEOUT_MS } from './config';
import { createProviderContext } from './context';
import { executableProviderById, getExecutableProviders, type ProviderInfo } from './manifest';
import { loadModuleSource, type ModuleKind } from './modules';
import { evaluateProviderModule, runProviderModule } from './sandbox';

// --- Shapes the modules return (normalized here) ---

export type Post = {
  title: string;
  link: string;
  image?: string;
};

export type LinkSource = {
  title?: string | null;
  link?: string | null;
  type?: string | null;
};

export type LinkEntry = {
  title?: string | null;
  quality?: string | null;
  directLinks?: LinkSource[] | null;
  episodesLink?: string | null;
};

export type MetaInfo = {
  title?: string | null;
  synopsis?: string | null;
  description?: string | null;
  image?: string | null;
  imdbId?: string | null;
  type?: string | null;
  linkList?: LinkEntry[] | null;
  webUrl?: string | null;
  poster?: string | null;
  logo?: string | null;
  tmdbId?: string | null;
  tags?: string[] | null;
  cast?: string[] | null;
  rating?: string | null;
};

export type Stream = {
  server?: string;
  link?: string;
  url?: string;
  type?: string;
  quality?: string;
  subtitles?: unknown;
  headers?: unknown;
};

export type Category = { title: string; filter: string };

export type Episode = { title: string; link: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function normalizePosts(value: unknown): Post[] {
  return asArray<unknown>(value)
    .filter(isRecord)
    .map((item) => ({
      title: asString(item.title) ?? 'Untitled',
      link: asString(item.link) ?? '',
      image: asString(item.image),
    }))
    .filter((post) => post.link.length > 0);
}

function normalizeMeta(value: unknown): MetaInfo {
  if (!isRecord(value)) return {};
  return {
    ...value,
    linkList: asArray<unknown>(value.linkList)
      .filter(isRecord)
      .map((entry) => ({
        title: asString(entry.title),
        quality: asString(entry.quality),
        directLinks: asArray<unknown>(entry.directLinks)
          .filter(isRecord)
          .map((source) => ({
            title: asString(source.title),
            link: asString(source.link),
            type: asString(source.type),
          })),
        episodesLink: asString(entry.episodesLink),
      })),
  } satisfies MetaInfo;
}

function normalizeStreams(value: unknown): Stream[] {
  return asArray<unknown>(value)
    .filter(isRecord)
    .map((item) => ({
      server: asString(item.server),
      link: asString(item.link) ?? asString(item.url),
      url: asString(item.url),
      type: asString(item.type),
      quality: asString(item.quality),
      ...(item.subtitles !== undefined ? { subtitles: item.subtitles } : {}),
      ...(item.headers !== undefined ? { headers: item.headers } : {}),
    }))
    .filter((stream) => typeof stream.link === 'string' && stream.link.length > 0);
}

function normalizeEpisodes(value: unknown): Episode[] {
  return asArray<unknown>(value)
    .filter(isRecord)
    .map((item) => ({
      title: asString(item.title) ?? 'Episode',
      link: asString(item.link) ?? '',
    }))
    .filter((episode) => episode.link.length > 0);
}

// --- Execution plumbing ---

async function executeModule<T>(
  provider: ProviderInfo,
  kind: ModuleKind,
  exportName: string,
  args: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const code = await loadModuleSource(provider, kind);
  return runProviderModule<T>(code, exportName, args, {
    filename: `${provider.id}/${kind}.js`,
    timeoutMs: PROVIDER_TIMEOUT_MS,
    signal,
  });
}

/** Module args shared by every call site. */
function moduleArgs(provider: ProviderInfo, signal?: AbortSignal): Record<string, unknown> {
  return {
    providerValue: provider.moduleDir,
    signal: signal ?? new AbortController().signal,
    providerContext: createProviderContext(),
  };
}

// --- Operations ---

export async function getCategories(providerId: string): Promise<Category[]> {
  const provider = await executableProviderById(providerId);
  if (!provider) throw missingProvider(providerId);
  const code = await loadModuleSource(provider, 'catalog');
  const exports = await evaluateProviderModule(
    code,
    createProviderContext(),
    `${provider.id}/catalog.js`,
  );
  const catalog = asArray<unknown>(exports.catalog)
    .filter(isRecord)
    .map((item) => ({
      title: asString(item.title) ?? 'Browse',
      filter: asString(item.filter) ?? '',
    }));
  const genres = asArray<unknown>(exports.genres)
    .filter(isRecord)
    .map((item) => ({
      title: asString(item.title) ?? 'Genres',
      filter: asString(item.filter) ?? '',
    }));
  const seen = new Set<string>();
  return [...catalog, ...genres].filter((category) => {
    if (seen.has(category.filter)) return false;
    seen.add(category.filter);
    return true;
  });
}

export async function getPosts(
  providerId: string,
  filter: string,
  page: number,
  signal?: AbortSignal,
): Promise<Post[]> {
  const provider = await executableProviderById(providerId);
  if (!provider) throw missingProvider(providerId);
  const posts = await executeModule<unknown>(
    provider,
    'posts',
    'getPosts',
    { ...moduleArgs(provider, signal), filter, page },
    signal,
  );
  return normalizePosts(posts);
}

export async function searchProvider(
  providerId: string,
  query: string,
  page: number,
  signal?: AbortSignal,
): Promise<Post[]> {
  const provider = await executableProviderById(providerId);
  if (!provider) throw missingProvider(providerId);
  const posts = await executeModule<unknown>(
    provider,
    'posts',
    'getSearchPosts',
    { ...moduleArgs(provider, signal), searchQuery: query, page },
    signal,
  );
  return normalizePosts(posts);
}

export async function getMetaInfo(
  providerId: string,
  link: string,
  signal?: AbortSignal,
): Promise<MetaInfo> {
  const provider = await executableProviderById(providerId);
  if (!provider) throw missingProvider(providerId);
  const meta = await executeModule<unknown>(
    provider,
    'meta',
    'getMeta',
    { ...moduleArgs(provider, signal), link },
    signal,
  );
  return normalizeMeta(meta);
}

export async function getEpisodeLinks(
  providerId: string,
  url: string,
  signal?: AbortSignal,
): Promise<Episode[]> {
  const provider = await executableProviderById(providerId);
  if (!provider) throw missingProvider(providerId);
  const episodes = await executeModule<unknown>(
    provider,
    'episodes',
    'getEpisodes',
    { ...moduleArgs(provider, signal), url },
    signal,
  );
  return normalizeEpisodes(episodes);
}

export async function getStreams(
  providerId: string,
  link: string,
  type: string,
  signal?: AbortSignal,
): Promise<Stream[]> {
  const provider = await executableProviderById(providerId);
  if (!provider) throw missingProvider(providerId);
  const streams = await executeModule<unknown>(
    provider,
    'stream',
    'getStream',
    { ...moduleArgs(provider, signal), link, type },
    signal,
  );
  return normalizeStreams(streams);
}

function missingProvider(id: string): ProviderError {
  return new ProviderError(404, `Unknown or unavailable provider: ${id}`, undefined, 'UNREACHABLE');
}

// --- Fan-out helpers ---

/** Runs `worker` over `items` with bounded concurrency, preserving order. */
async function runWithConcurrency<T, R>(
  items: T[],
  worker: (item: T) => Promise<R>,
  concurrency = PROVIDER_CONCURRENCY,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

type MergeablePost = {
  title: string;
  link: string;
  image?: string;
  type?: string;
  providerId?: string;
  providerName?: string;
  providerIds?: string[];
  providerNames?: string[];
};

// Merges duplicate titles (across providers) into one entry with the union
// of provider ids/names, preferring an entry that already has a type.
export function mergePostsByTitle<T extends MergeablePost>(items: T[]): T[] {
  const merged = new Map<string, T>();
  for (const item of items) {
    const key = `${(item.type || 'movie').toLowerCase()}|${item.title.trim().toLowerCase()}`;
    const current = merged.get(key);
    if (!current) {
      merged.set(key, item);
      continue;
    }
    if (!current.type && item.type) {
      merged.set(key, item);
      continue;
    }
    const providerIds = Array.from(
      new Set([
        ...(current.providerId ? [current.providerId] : []),
        ...(item.providerId ? [item.providerId] : []),
      ]),
    );
    const providerNames = Array.from(
      new Set([
        ...(current.providerName ? [current.providerName] : []),
        ...(item.providerName ? [item.providerName] : []),
      ]),
    );
    merged.set(key, { ...current, providerIds, providerNames });
  }
  return [...merged.values()];
}

export type FeaturedRail = {
  featured: (Post & { type?: string })[];
  newest: (Post & { type?: string })[];
  movies: (Post & { type?: string })[];
  series: (Post & { type?: string })[];
};

// Picks a catalog filter for a rail from a provider's category list. Movie
// filters prefer titles mentioning movies/quality; series filters prefer
// series/season/web tags. Falls back to the first (or second) entry. The
// empty filter is the "latest" rail and is a valid choice, so no-filter is
// signaled with `null`.
function pickFilter(categories: Category[], kind: 'movie' | 'series'): string | null {
  const pattern =
    kind === 'movie'
      ? /movie|1080p|4k|hd|dubbed|hollywood|bollywood|dual/i
      : /series|season|tv|web|episode/i;
  const direct = categories.find((category) => pattern.test(category.title));
  if (direct) return direct.filter;
  if (categories.length === 0) return null;
  if (kind === 'movie') return categories[0].filter;
  return categories[1]?.filter ?? categories[0].filter;
}

type ProviderFeed = {
  provider: ProviderInfo;
  movies: (Post & { type: string })[];
  series: (Post & { type: string })[];
};

async function providerFeed(provider: ProviderInfo, signal: AbortSignal): Promise<ProviderFeed> {
  const categories = await getCategories(provider.id);
  const movieFilter = pickFilter(categories, 'movie');
  const seriesFilter = pickFilter(categories, 'series');
  const [movies, series] = await Promise.allSettled([
    movieFilter !== null
      ? getPosts(provider.id, movieFilter, 1, signal)
      : Promise.resolve([] as Post[]),
    seriesFilter !== null
      ? getPosts(provider.id, seriesFilter, 1, signal)
      : Promise.resolve([] as Post[]),
  ]);
  return {
    provider,
    movies: (movies.status === 'fulfilled' ? movies.value : []).map((post) => ({
      ...post,
      type: 'movie',
    })),
    series: (series.status === 'fulfilled' ? series.value : []).map((post) => ({
      ...post,
      type: 'series',
    })),
  };
}

/** Single-provider feed (provider specified). */
export async function featuredFeedFor(
  providerId: string,
  signal?: AbortSignal,
): Promise<FeaturedRail> {
  const provider = await executableProviderById(providerId);
  if (!provider) throw missingProvider(providerId);
  const feed = await providerFeed(provider, signal ?? new AbortController().signal);
  const newest = dedupeByLink([...feed.movies, ...feed.series]);
  return {
    featured: feed.movies.slice(0, 6),
    newest: newest.slice(0, 12),
    movies: feed.movies.slice(0, 12),
    series: feed.series.slice(0, 12),
  };
}

/** Multi-provider feed: fans out, degrades per-provider, merged by title. */
export async function featuredFeedAll(
  signal?: AbortSignal,
  preferredId?: string,
): Promise<FeaturedRail> {
  const providers = await getExecutableProviders();
  if (providers.length === 0) {
    throw new ProviderError(502, 'No providers are available right now.', undefined, 'UNREACHABLE');
  }
  // The default channel's content leads the home page: its items come first
  // in every rail and in the merged dedupe (first occurrence wins).
  const ordered = preferredId
    ? providers.sort((a, b) => {
        const aPreferred = a.id.toLowerCase() === preferredId.toLowerCase() ? 1 : 0;
        const bPreferred = b.id.toLowerCase() === preferredId.toLowerCase() ? 1 : 0;
        return bPreferred - aPreferred;
      })
    : providers;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVIDER_DEADLINE_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const feeds = await runWithConcurrency(ordered, async (provider) => {
      try {
        return await providerFeed(provider, controller.signal);
      } catch {
        // One dead provider must not sink the home feed.
        return { provider, movies: [], series: [] };
      }
    });
    const movies = mergePostsByTitle(
      feeds.flatMap((feed) =>
        feed.movies.map((post) => ({
          ...post,
          providerId: feed.provider.id,
          providerName: feed.provider.name,
        })),
      ),
    );
    const series = mergePostsByTitle(
      feeds.flatMap((feed) =>
        feed.series.map((post) => ({
          ...post,
          providerId: feed.provider.id,
          providerName: feed.provider.name,
        })),
      ),
    );
    const newest = dedupeByLink([...movies, ...series]);
    return {
      featured: movies.slice(0, 6),
      newest: newest.slice(0, 12),
      movies: movies.slice(0, 12),
      series: series.slice(0, 12),
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/** Multi-provider search: fans out, degrades per-provider, merged by title. */
export async function searchAll(
  query: string,
  signal?: AbortSignal,
): Promise<
  (Post & {
    providerId?: string;
    providerName?: string;
    providerIds?: string[];
    providerNames?: string[];
  })[]
> {
  const providers = await getExecutableProviders();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVIDER_DEADLINE_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const groups = await runWithConcurrency(providers, async (provider) => {
      try {
        const posts = await searchProvider(provider.id, query, 1, controller.signal);
        return posts.map((post) => ({
          ...post,
          providerId: provider.id,
          providerName: provider.name,
        }));
      } catch {
        return [];
      }
    });
    return mergePostsByTitle(groups.flat());
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

function dedupeByLink<T extends { link: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.link)) return false;
    seen.add(item.link);
    return true;
  });
}
