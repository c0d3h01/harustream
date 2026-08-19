// Search operation for GET /api/search. Without a provider the server fans out
// across every executable provider (bounded concurrency + deadline, per-provider
// degradation) and returns deduplicated results annotated with their sources.
// With a provider only that provider is searched.

import { providerById, searchAll, searchProvider } from '@/providers';
import { ProviderError } from '@/providers/errors';

export type SearchResult = Awaited<ReturnType<typeof searchAll>>;

export async function searchCatalog(
  query: string,
  provider?: string,
  signal?: AbortSignal,
): Promise<SearchResult> {
  if (!query.trim()) {
    throw new ProviderError(400, 'Missing q parameter', 'BAD_GATEWAY');
  }
  if (provider) {
    const info = await providerById(provider);
    return (await searchProvider(provider, query, 1, signal)).map((post) => ({
      ...post,
      providerId: provider,
      providerName: info?.name ?? provider,
    }));
  }
  return searchAll(query, signal);
}
