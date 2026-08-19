// Episode-list resolution for GET /api/media/episodes. Resolves a series'
// per-episode links from a provider's episodes hub URL.

import { type Episode, getEpisodeLinks } from '@/providers';
import { ProviderError } from '@/providers/errors';

export async function getEpisodeLinksFor(
  link: string,
  provider: string,
  signal?: AbortSignal,
): Promise<Episode[]> {
  if (!link.trim()) {
    throw new ProviderError(400, 'Missing link parameter', 'BAD_GATEWAY');
  }
  if (!provider.trim()) {
    throw new ProviderError(400, 'Missing provider parameter', 'BAD_GATEWAY');
  }
  return getEpisodeLinks(provider, link, signal);
}
