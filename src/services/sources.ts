// Resolves a provider's stream list and mints every playback href the
// client will ever see. Minting happens here — not in the proxy route,
// which never re-resolves anything — because this is where the provider's
// upstream URL is known and where the token-signing secret is available on
// the Node runtime (providers use cheerio/axios, which can't run on Edge).

import { TtlCache } from '@/lib/cache';
import { canonicalPath, chunkIdFor, proxyPath } from '@/lib/streaming/cacheKeys';
import { mintProxyToken, PLAYBACK_TOKEN_TTL_MS } from '@/lib/streaming/token';
import type { ProxyResourceKind, StreamVariant, SubtitleTrack } from '@/lib/streaming/types';
import { createProviderContext } from '@/providers/_shared';
import { getProvider } from '@/providers/registry';
import { parseRaw, rawStreamSchema } from '@/validations/provider';
import { providerTimeoutSignal } from './fanout';
import { idFor, orderVariants, type RawVariant, toRawVariant } from './normalize';

// Resolution (talking to a provider) is cached — this is a pure performance
// optimization with no correctness dependency downstream: the proxy route
// never looks anything up here, it only decrypts what a request already
// carries. A stale or repopulated cache entry can, at worst, make this
// function return a slightly different list on the next call; it can never
// make the proxy serve different bytes for a token that's already been
// minted and handed to a client.
const cache = new TtlCache<RawVariant[]>();

const DEFAULT_LIST_TTL_MS = 120_000;
export function streamSourceCacheTtlMs(): number {
  const raw = Number(process.env.STREAM_SOURCE_CACHE_TTL_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_LIST_TTL_MS * 4;
}

async function resolveRawVariants(
  providerId: string,
  ref: string,
  kind: string,
  signal: AbortSignal | undefined,
  ttlMs: number,
): Promise<RawVariant[]> {
  return cache.getOrSet(
    `sources:${providerId}:${ref}:${kind}`,
    ttlMs,
    async () => {
      const provider = getProvider(providerId);
      const raw = await provider.getStream({
        link: ref,
        type: kind,
        signal: providerTimeoutSignal(),
        ctx: createProviderContext(provider.id),
      });
      const parsed = parseRaw(rawStreamSchema.array(), raw, {
        provider: provider.id,
        op: 'stream',
      });
      const mediaId = idFor(providerId, ref);
      return orderVariants(parsed.map((stream) => toRawVariant(stream, provider.id, mediaId)));
    },
    signal,
  );
}

function proxyKindFor(variant: RawVariant): ProxyResourceKind {
  return variant.format === 'hls' || variant.format === 'mpd' ? 'manifest' : 'binary';
}

async function mintSubtitleTrack(
  subtitle: RawVariant['subtitles'][number],
  parent: Pick<RawVariant, 'mediaId' | 'providerId' | 'variantId'>,
): Promise<SubtitleTrack> {
  const chunkId = await chunkIdFor(subtitle.upstreamUrl);
  const path = canonicalPath(
    parent.mediaId,
    parent.providerId,
    parent.variantId,
    'subtitle',
    chunkId,
  );
  const { token, exp } = await mintProxyToken(
    {
      url: subtitle.upstreamUrl,
      subtitleFormat: subtitle.format === 'vtt' ? undefined : subtitle.format,
    },
    PLAYBACK_TOKEN_TTL_MS,
    path,
  );
  return {
    id: subtitle.id,
    label: subtitle.label,
    language: subtitle.language,
    url: subtitle.upstreamUrl,
    format: subtitle.format,
    href: `${proxyPath(parent, 'subtitle', chunkId)}?exp=${exp}&token=${encodeURIComponent(token)}`,
  };
}

async function mintVariant(raw: RawVariant): Promise<StreamVariant> {
  const kind = proxyKindFor(raw);
  const chunkId = await chunkIdFor(raw.upstreamUrl);
  const path = canonicalPath(raw.mediaId, raw.providerId, raw.variantId, kind, chunkId);
  const [{ token, exp }, subtitles] = await Promise.all([
    mintProxyToken({ url: raw.upstreamUrl, headers: raw.headers }, PLAYBACK_TOKEN_TTL_MS, path),
    Promise.all(raw.subtitles.map((subtitle) => mintSubtitleTrack(subtitle, raw))),
  ]);
  return {
    mediaId: raw.mediaId,
    providerId: raw.providerId,
    variantId: raw.variantId,
    format: raw.format,
    quality: raw.quality,
    label: raw.label,
    headers: raw.headers,
    subtitles,
    skip: raw.skip,
    playbackHref: `${proxyPath(raw, kind, chunkId)}?exp=${exp}&token=${encodeURIComponent(token)}`,
  };
}

/** Resolves a provider's stream list and mints every playback href in one
 *  pass. This is the only function the rest of the app should call to get
 *  playable variants — everything a client receives from here is already a
 *  server-authoritative, opaque proxy href. */
export async function sources(
  providerId: string,
  ref: string,
  kind = 'movie',
  signal?: AbortSignal,
  ttlMs: number = DEFAULT_LIST_TTL_MS,
): Promise<StreamVariant[]> {
  const raw = await resolveRawVariants(providerId, ref, kind, signal, ttlMs);
  return Promise.all(raw.map(mintVariant));
}
