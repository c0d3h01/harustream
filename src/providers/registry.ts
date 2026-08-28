import { AppError } from '@/lib/errors';
import { anikoto } from './anikoto';
import { Moviesmod } from './Moviesmod';
import { movieBoxWeb } from './movieBoxWeb';
import type { ProviderModule } from './types';
import { adaptVegaProvider } from './vegaAdapter';
export { vegaProviderInventory } from './vegaProviders';

export const providerRegistry: Record<string, ProviderModule> = {
  Moviesmod,
  movieBoxWeb,
  anikoto: adaptVegaProvider(anikoto, {
    status: 'available',
    note: 'Normalized from the Vega-compatible provider contract.',
  }),
};

export function getProvider(id: string): ProviderModule {
  const provider = providerRegistry[id];
  if (!provider) throw new AppError('NOT_FOUND', `Unknown provider: ${id}`);
  return provider;
}

export function listProviders(): ProviderModule[] {
  return Object.values(providerRegistry);
}
