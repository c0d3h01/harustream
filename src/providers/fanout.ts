// Fan-out across providers for the multi-provider API endpoints (/api/search,
// /api/featured without a provider). Runs workers with bounded concurrency
// and an overall deadline; failures degrade per-provider instead of failing
// the whole response, and results are merged by title.

import { ProviderError } from './errors';
import { PROVIDER_CONCURRENCY, PROVIDER_DEADLINE_MS } from './registry/config';
import { getExecutableProviders } from './registry/manifest';
import { type FeaturedRail, featuredFeedFor, type Post, searchProvider } from './runtime';

/** Runs `worker` over `items` with bounded concurrency, preserving order. */
export async function runWithConcurrency<T, R>(
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

function dedupeByLink<T extends { link: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.link)) return false;
    seen.add(item.link);
    return true;
  });
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

/** Multi-provider feed: fans out, degrades per-provider, merged by title. */
export async function featuredFeedAll(
  signal?: AbortSignal,
  preferredId?: string,
): Promise<FeaturedRail> {
  const providers = await getExecutableProviders();
  if (providers.length === 0) {
    throw new ProviderError(502, 'No providers are available right now.', undefined, 'UNREACHABLE');
  }
  const ordered = preferredId
    ? [...providers].sort(
        (a, b) =>
          Number(b.id.toLowerCase() === preferredId.toLowerCase()) -
          Number(a.id.toLowerCase() === preferredId.toLowerCase()),
      )
    : providers;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVIDER_DEADLINE_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const feeds = await runWithConcurrency(ordered, async (provider) => {
      try {
        const feed = await featuredFeedFor(provider.id, controller.signal);
        return { provider, ...feed };
      } catch {
        // One dead provider must not sink the home feed.
        return { provider, featured: [], newest: [], movies: [], series: [] };
      }
    });
    const merge = (kind: 'movie' | 'series') =>
      mergePostsByTitle(
        feeds.flatMap((feed) =>
          (kind === 'movie' ? feed.movies : feed.series).map((post) => ({
            ...post,
            providerId: feed.provider.id,
            providerName: feed.provider.name,
          })),
        ),
      );
    const movies = merge('movie');
    const series = merge('series');
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
