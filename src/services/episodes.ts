import { TtlCache } from '@/lib/cache';
import { AppError } from '@/lib/errors';
import { createProviderContext } from '@/providers/context';
import { getProvider } from '@/providers/registry';
import type { Episode } from '@/types';
import { parseRaw, rawEpisodeSchema } from '@/validations/provider';
import { toEpisode } from './normalize';

const cache = new TtlCache<Episode[]>();

export function episodes(
  providerId: string,
  ref: string,
  signal?: AbortSignal,
): Promise<Episode[]> {
  return cache.getOrSet(`episodes:${providerId}:${ref}`, 60_000, async () => {
    const provider = getProvider(providerId);
    if (!provider.getEpisodes) {
      throw new AppError('NOT_FOUND', `${provider.name} does not provide episodes`);
    }
    const raw = await provider.getEpisodes({
      url: ref,
      signal,
      ctx: createProviderContext(provider.id),
    });
    return parseRaw(rawEpisodeSchema.array(), raw, { provider: provider.id, op: 'episodes' }).map(
      (episode) => toEpisode(episode, provider.id),
    );
  });
}
