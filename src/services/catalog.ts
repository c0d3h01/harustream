import { listProviders } from '@/providers/registry';
import type { SearchResult } from '@/types/media';
import { rawPostSchema } from '@/validations/provider';
import { runFanout } from './fanout';
import { mapPosts } from './normalize';
import { cached, callProvider } from './provider';

export interface CatalogRail {
  key: string;
  heading: string;
  items: SearchResult[];
}

interface FeaturedResult {
  rails: CatalogRail[];
}

/**
 * Aggregate a "featured" rail set from all registered providers by searching
 * for a broad trending query. The result is cached for 5 minutes.
 *
 * Providers that lack `getSearchPosts` are silently skipped.
 */
export async function featured(signal?: AbortSignal): Promise<FeaturedResult> {
  return cached(
    'catalog:featured',
    300_000,
    async () => {
      const providers = listProviders().filter((p) => p.getSearchPosts);
      if (providers.length === 0) return { rails: [] };

      const results = await runFanout(providers, (provider, providerSignal) =>
        callProvider({
          providerId: provider.id,
          op: 'search',
          schema: rawPostSchema.array(),
          invoke: (p, ps) =>
            p.getSearchPosts?.({ query: '', page: 1, signal: ps }) ?? Promise.resolve([]),
          map: (parsed, p) => mapPosts(parsed, p.id, p.name),
          signal: providerSignal,
        }),
      );

      const rails: CatalogRail[] = [];
      for (const result of results) {
        const items = result.value ?? [];
        if (items.length > 0) {
          rails.push({
            key: result.provider.id,
            heading: result.provider.name,
            items: items.slice(0, 20),
          });
        }
      }
      return { rails };
    },
    signal,
  );
}
