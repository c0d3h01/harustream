import type { ProviderModule } from './types';

export type VegaProviderStatus = 'available' | 'experimental' | 'blocked';

export type VegaProviderDescriptor = {
  id: string;
  name: string;
  status: VegaProviderStatus;
  source: 'native' | 'vega-adapter';
  note?: string;
};

/**
 * Stable boundary for importing Vega-compatible modules without coupling the
 * app to their internal implementation details. Providers are enabled only
 * after they satisfy HaruStream's normalized ProviderModule contract.
 */
export function adaptVegaProvider(
  provider: ProviderModule,
  descriptor?: Partial<VegaProviderDescriptor>,
): ProviderModule & { descriptor: VegaProviderDescriptor } {
  const normalized: VegaProviderDescriptor = {
    id: descriptor?.id ?? provider.id,
    name: descriptor?.name ?? provider.name,
    status: descriptor?.status ?? 'experimental',
    source: descriptor?.source ?? 'vega-adapter',
    note: descriptor?.note,
  };

  return Object.assign(provider, { descriptor: normalized });
}

export function describeProvider(provider: ProviderModule): VegaProviderDescriptor {
  return 'descriptor' in provider
    ? (provider as ProviderModule & { descriptor: VegaProviderDescriptor }).descriptor
    : {
        id: provider.id,
        name: provider.name,
        status: 'available',
        source: 'native',
      };
}

export async function withProviderTimeout<T>(
  task: (signal: AbortSignal) => Promise<T>,
  timeoutMs = 8_000,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await task(controller.signal);
  } finally {
    clearTimeout(timeout);
  }
}
