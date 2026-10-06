import { TtlCache } from '@/lib/cache';
import type { Media } from '@/types/media';
import { rawInfoSchema } from '@/validations/provider';
import { toMedia } from './normalize';
import { callProvider } from './provider';

const cache = new TtlCache<Media>();

export function media(providerId: string, ref: string, signal?: AbortSignal): Promise<Media> {
  return callProvider({
    providerId,
    op: 'metadata',
    schema: rawInfoSchema,
    invoke: (provider, providerSignal) => provider.getMeta({ link: ref, signal: providerSignal }),
    map: (parsed, provider) => toMedia(parsed, provider.id, ref),
    cache: { store: cache, key: `media:${providerId}:${ref}`, ttlMs: 60_000 },
    signal,
  });
}
