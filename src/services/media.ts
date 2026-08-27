import { TtlCache } from '@/lib/cache';
import { createProviderContext } from '@/providers/context';
import { getProvider } from '@/providers/registry';
import type { Media } from '@/types';
import { parseRaw, rawInfoSchema } from '@/validations/provider';
import { toMedia } from './normalize';

const cache = new TtlCache<Media>();

export function media(providerId: string, ref: string, signal?: AbortSignal): Promise<Media> {
  return cache.getOrSet(`media:${providerId}:${ref}`, 60_000, async () => {
    const provider = getProvider(providerId);
    const raw = await provider.getMeta({
      link: ref,
      signal,
      ctx: createProviderContext(provider.id),
    });
    return toMedia(
      parseRaw(rawInfoSchema, raw, { provider: provider.id, op: 'metadata' }),
      provider.id,
      ref,
    );
  });
}
