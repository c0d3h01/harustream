import { createProviderContext } from '@/providers/context';
import { getProvider, listProviders } from '@/providers/registry';
import type { Catalog, SearchResult } from '@/types';
import { parseRaw, rawPostSchema } from '@/validations/provider';
import { runFanout } from './fanout';
import { toSearchResult } from './normalize';

export async function catalog(
  providerId: string,
  filter: string,
  page = 1,
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  const provider = getProvider(providerId);
  const posts = await provider.getPosts({
    filter,
    page,
    signal,
    ctx: createProviderContext(provider.id),
  });
  return parseRaw(rawPostSchema.array(), posts, {
    provider: provider.id,
    op: 'catalog',
  }).map((post) => toSearchResult(post, provider.id, provider.name));
}

export function providerCatalog(providerId: string): Catalog[] {
  const provider = getProvider(providerId);
  return [...provider.catalog, ...provider.genres];
}

export async function featured(signal?: AbortSignal) {
  const results = await runFanout(
    listProviders(),
    (provider, providerSignal) =>
      catalog(provider.id, provider.catalog[0]?.filter ?? '', 1, providerSignal),
    signal,
  );
  const rails = results
    .filter((result): result is typeof result & { value: SearchResult[] } => Boolean(result.value))
    .map((result) => ({
      title: result.provider.name,
      items: result.value,
    }));
  return { rails };
}
