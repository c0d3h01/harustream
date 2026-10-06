import { ProviderError } from '@/lib/errors';
import { listProviders } from '@/providers/registry';
import type { SearchResult } from '@/types/media';
import { rawPostSchema } from '@/validations/provider';
import { runFanout } from './fanout';
import { mapPosts } from './normalize';
import { cached, callProvider } from './provider';

export async function search(
  query: string,
  providerId?: string,
  page = 1,
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  if (!query.trim()) throw new ProviderError('Search query is required');
  if (providerId) {
    return cached(
      `search:${providerId}:${query}:${page}`,
      30_000,
      () =>
        callProvider({
          providerId,
          op: 'search',
          schema: rawPostSchema.array(),
          invoke: (provider, providerSignal) =>
            provider.getSearchPosts?.({ query, page, signal: providerSignal }) ??
            Promise.resolve([]),
          map: (parsed, provider) => mapPosts(parsed, provider.id, provider.name),
          signal,
        }),
      signal,
    );
  }
  return cached(
    `search:*:${query}:${page}`,
    30_000,
    async () => {
      const results = await runFanout(listProviders(), (provider, providerSignal) =>
        callProvider({
          providerId: provider.id,
          op: 'search',
          schema: rawPostSchema.array(),
          invoke: (p, ps) => p.getSearchPosts?.({ query, page, signal: ps }) ?? Promise.resolve([]),
          map: (parsed, p) => mapPosts(parsed, p.id, p.name),
          signal: providerSignal,
        }),
      );
      const merged: SearchResult[] = [];
      for (const result of results) {
        for (const item of result.value ?? []) {
          merged.push(item);
        }
      }
      return merged;
    },
    signal,
  );
}
