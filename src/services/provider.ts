import type { z } from 'zod';
import type { TtlCache } from '@/lib/cache';
import { envInt } from '@/lib/env';
import { type ProviderContext, type ProviderModule, providerContext } from '@/providers/_shared';
import { getProvider } from '@/providers/registry';
import { parseRaw } from '@/validations/provider';

interface ProviderCall<Parsed, Out> {
  providerId: string;
  op: string;
  schema: z.ZodType<Parsed>;
  invoke: (provider: ProviderModule, ctx: ProviderContext, signal: AbortSignal) => Promise<unknown>;
  map: (parsed: Parsed, provider: ProviderModule) => Out;
  cache?: { store: TtlCache<Out>; key: string; ttlMs: number };
  signal?: AbortSignal;
}

async function runCall<Parsed, Out>(call: ProviderCall<Parsed, Out>): Promise<Out> {
  const provider = getProvider(call.providerId);
  const timeout = AbortSignal.timeout(envInt('PROVIDER_TIMEOUT_MS', 10_000));
  const signal = call.signal ? AbortSignal.any([call.signal, timeout]) : timeout;
  const raw = await call.invoke(provider, providerContext, signal);
  return call.map(parseRaw(call.schema, raw, { provider: provider.id, op: call.op }), provider);
}

export function callProvider<Parsed, Out>(call: ProviderCall<Parsed, Out>): Promise<Out> {
  const { cache, signal } = call;
  if (!cache) return runCall(call);
  return cache.store.getOrSet(
    cache.key,
    cache.ttlMs,
    () => runCall({ ...call, signal: undefined }),
    signal,
  );
}
