import { appCache, TtlCache } from '@/lib/cache';
import { ProviderError } from '@/lib/errors';
import { createProviderContext } from '@/providers/_shared';
import { getProvider, listProviders } from '@/providers/registry';
import type { SearchResult } from '@/types';
import { parseRaw, rawPostSchema } from '@/validations/provider';
import { providerTimeoutSignal, runFanout } from './fanout';
import { toSearchResult } from './normalize';

const cache = new TtlCache<SearchResult[]>();

async function searchProvider(
  providerId: string,
  query: string,
  page: number,
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  const provider = getProvider(providerId);
  const posts = await provider.getSearchPosts({
    query,
    page,
    signal,
    ctx: createProviderContext(provider.id),
  });
  const parsed = parseRaw(rawPostSchema.array(), posts, { provider: provider.id, op: 'search' });
  return parsed.map((post) => toSearchResult(post, provider.id, provider.name));
}

export async function search(
  query: string,
  providerId?: string,
  page = 1,
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  if (!query.trim()) throw new ProviderError('Search query is required');
  if (providerId) {
    return cache.getOrSet(
      `search:${providerId}:${query}:${page}`,
      30_000,
      () => searchProvider(providerId, query, page, providerTimeoutSignal()),
      signal,
    );
  }
  return cache.getOrSet(
    `search:*:${query}:${page}`,
    30_000,
    async () => {
      const results = await runFanout(listProviders(), (provider, providerSignal) =>
        searchProvider(provider.id, query, page, providerSignal),
      );
      const merged: SearchResult[] = [];
      const seen = new Set<string>();
      for (const result of results) {
        for (const item of result.value ?? []) {
          const key = `${item.title.toLowerCase()}:${item.providerId}`;
          if (!seen.has(key)) {
            seen.add(key);
            merged.push(item);
          }
        }
      }
      return merged;
    },
    signal,
  );
}

export { appCache };
