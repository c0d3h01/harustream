import { TtlCache } from '@/lib/cache';
import { createProviderContext } from '@/providers/_shared';
import { getProvider } from '@/providers/registry';
import type { StreamSource } from '@/types';
import { parseRaw, rawStreamSchema } from '@/validations/provider';
import { orderSources, toStreamSource } from './normalize';

const cache = new TtlCache<StreamSource[]>();

// Stream-list freshness. The player resolves sources once, then every range
// request from the <video> element flows through /api/proxy, which re-resolves
// from this same cache. The window must outlive both gaps — the page-read to
// play press, and the multi-source failover loop — so the source id minted in
// the player's list still resolves when a proxy request for it lands.
const DEFAULT_LIST_TTL_MS = 120_000;
export function streamSourceCacheTtlMs(): number {
  const raw = Number(process.env.STREAM_SOURCE_CACHE_TTL_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_LIST_TTL_MS * 4;
}

export function sources(
  providerId: string,
  ref: string,
  kind = 'movie',
  signal?: AbortSignal,
  ttlMs: number = DEFAULT_LIST_TTL_MS,
): Promise<StreamSource[]> {
  return cache.getOrSet(`sources:${providerId}:${ref}:${kind}`, ttlMs, async () => {
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

// The player addresses a specific quality by sourceId. Provider CDNs rotate
// signed URLs on every scrape — vega's token even lives in the URL path — so
// the exact source an id refers to can be gone by the time the proxy
// re-resolves. Instead of 404ing, fall back to the best remaining progressive
// stream. DASH manifests are deliberately skipped: the app hands those to the
// browser unproxied, and a player configured for mp4/mkv/hls cannot consume
// manifest bytes streamed through the proxy.
export function selectStreamSource(
  sources: StreamSource[],
  requestedId?: string,
): StreamSource | undefined {
  if (requestedId) {
    const exact = sources.find((source) => source.id === requestedId);
    if (exact) return exact;
    const progressive = sources.find((source) => source.format !== 'mpd');
    if (progressive) return progressive;
  }
  return sources[0];
}
