import type { Media } from '@/types/media';
import { rawInfoSchema } from '@/validations/provider';
import { toMedia } from './normalize';
import { cached, callProvider } from './provider';

export function media(providerId: string, ref: string, signal?: AbortSignal): Promise<Media> {
  return cached(
    `media:${providerId}:${ref}`,
    60_000,
    () =>
      callProvider({
        providerId,
        op: 'metadata',
        schema: rawInfoSchema,
        invoke: (provider, providerSignal) =>
          provider.getMeta({ link: ref, signal: providerSignal }),
        map: (parsed, provider) => toMedia(parsed, provider.id, ref),
      }),
    signal,
  );
}
