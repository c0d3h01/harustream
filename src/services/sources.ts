import { TtlCache } from '@/lib/cache';
import { createProviderContext } from '@/providers/context';
import { getProvider } from '@/providers/registry';
import type { StreamSource } from '@/types';
import { parseRaw, rawStreamSchema } from '@/validations/provider';
import { orderSources, toStreamSource } from './normalize';

const cache = new TtlCache<StreamSource[]>();

export function sources(
  providerId: string,
  ref: string,
  kind = 'movie',
  signal?: AbortSignal,
): Promise<StreamSource[]> {
  return cache.getOrSet(`sources:${providerId}:${ref}:${kind}`, 30_000, async () => {
    const provider = getProvider(providerId);
    const raw = await provider.getStream({
      link: ref,
      type: kind,
      signal,
      ctx: createProviderContext(provider.id),
    });
    const parsed = parseRaw(rawStreamSchema.array(), raw, { provider: provider.id, op: 'stream' });
    return orderSources(parsed.map((stream) => toStreamSource(stream, provider.id)));
  });
}
