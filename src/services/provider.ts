import type { z } from 'zod';
import { TtlCache } from '@/lib/cache';
import { envInt } from '@/lib/env';
import { AppError } from '@/lib/errors';
import type { ProviderModule } from '@/providers/_shared';
import { getProvider } from '@/providers/registry';

// Single cache for all services. Callers share it through cached() below;
// per-file TtlCache declarations are gone, so one keyspace + one Map.
const sharedCache = new TtlCache<unknown>();

export function providerTimeoutMs(): number {
  return envInt('PROVIDER_TIMEOUT_MS', 10_000);
}

// Single timeout mechanism: AbortSignal.timeout, combined with the caller's
// signal when one is present. Both callProvider and runFanout use this.
export function timeoutSignal(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(providerTimeoutMs());
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

export function cached<T>(
  key: string,
  ttlMs: number,
  factory: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  return sharedCache.getOrSet(key, ttlMs, factory, signal) as Promise<T>;
}

export async function callProvider<Parsed, Out>(call: {
  providerId: string;
  op: string;
  schema: z.ZodType<Parsed>;
  invoke: (provider: ProviderModule, signal: AbortSignal) => Promise<unknown>;
  map: (parsed: Parsed, provider: ProviderModule) => Out;
  signal?: AbortSignal;
}): Promise<Out> {
  const provider = getProvider(call.providerId);
  const raw = await call.invoke(provider, timeoutSignal(call.signal));
  const parsed = call.schema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError(
      'INVALID_RESPONSE',
      `${provider.id} ${call.op} returned invalid response: ${parsed.error.message}`,
    );
  }
  return call.map(parsed.data, provider);
}
