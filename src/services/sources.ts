import { TtlCache } from '@/lib/cache';
import { streamHref } from '@/lib/streaming/streamUrl';
import type { StreamVariant } from '@/lib/streaming/types';
import { rawStreamSchema } from '@/validations/provider';
import { orderVariants, type RawVariant, toRawVariant } from './normalize';
import { callProvider } from './provider';

const cache = new TtlCache<RawVariant[]>();

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
  const raw = await callProvider({
    providerId,
    op: 'stream',
    schema: rawStreamSchema.array(),
    invoke: (provider, providerSignal) =>
      provider.getStream({ link: ref, type: kind, signal: providerSignal }),
    map: (parsed, provider) =>
      orderVariants(parsed.map((stream) => toRawVariant(stream, provider.id))),
    cache: { store: cache, key: `sources:${providerId}:${ref}:${kind}`, ttlMs: 120_000 },
    signal,
  });
  return raw.map(toVariant);
}
