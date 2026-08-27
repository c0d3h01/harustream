import { TtlCache } from '@/lib/cache';
import { createProviderContext } from '@/providers/context';
import { getProvider } from '@/providers/registry';
import type { StreamSource } from '@/types';
import { parseRaw, rawStreamSchema } from '@/validations/provider';
import { orderSources, toStreamSource } from './normalize';

const cache = new TtlCache<StreamSource[]>();

// Default catalog/listing freshness; the streaming proxy requests a longer
// window because every <video> range request flows through resolution and
// provider scrapes are far too expensive per-seek.
const DEFAULT_LIST_TTL_MS = 30_000;
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
