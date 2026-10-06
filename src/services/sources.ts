import { streamHref } from '@/lib/streaming/streamUrl';
import type { StreamVariant } from '@/lib/streaming/types';
import { rawStreamSchema } from '@/validations/provider';
import { orderVariants, type RawVariant, toRawVariant } from './normalize';
import { cached, callProvider } from './provider';

function toVariant(raw: RawVariant): StreamVariant {
  return {
    providerId: raw.providerId,
    variantId: raw.variantId,
    format: raw.format,
    quality: raw.quality,
    label: raw.label,
    skip: raw.skip,
    playbackHref: streamHref(raw.providerId, raw.upstreamUrl),
    subtitles: raw.subtitles.map((subtitle) => ({
      id: subtitle.id,
      label: subtitle.label,
      language: subtitle.language,
      format: subtitle.format,
      href: streamHref(
        raw.providerId,
        subtitle.upstreamUrl,
        subtitle.format === 'vtt' ? undefined : subtitle.format,
      ),
    })),
  };
}

export async function sources(
  providerId: string,
  ref: string,
  kind = 'movie',
  signal?: AbortSignal,
): Promise<StreamVariant[]> {
  const raw = await cached(
    `sources:${providerId}:${ref}:${kind}`,
    120_000,
    () =>
      callProvider({
        providerId,
        op: 'stream',
        schema: rawStreamSchema.array(),
        invoke: (provider, providerSignal) =>
          provider.getStream({ link: ref, type: kind, signal: providerSignal }),
        map: (parsed, provider) =>
          orderVariants(parsed.map((stream) => toRawVariant(stream, provider.id))),
      }),
    signal,
  );
  return raw.map(toVariant);
}
