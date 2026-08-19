// High-level provider operations executed by the sidecar. Each operation
// resolves the provider's module dir from the live manifest, executes the
// matching dist/ module in the vm sandbox, and normalizes the result into
// the shapes the API contract defines.
//
// Fan-out across providers happens in the Go functions; this module only
// serves single-provider operations.

import { createProviderContext } from './context';
import { ProviderError } from './errors';
import { PROVIDER_TIMEOUT_MS } from './registry/config';
import { executableProviderById, type ProviderInfo } from './registry/manifest';
import { loadModuleSource, type ModuleKind } from './registry/modules';
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

// --- Featured feed (single provider) ---

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

function dedupeByLink<T extends { link: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.link)) return false;
    seen.add(item.link);
    return true;
  });
}
