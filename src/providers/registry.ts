import { AppError } from '@/lib/errors';
import { anikoto } from './anikoto';
import { Moviesmod } from './Moviesmod';
import { movieBoxWeb } from './movieBoxWeb';
import type { ProviderModule } from './types';

export const providerRegistry: Record<string, ProviderModule> = {
  Moviesmod,
  movieBoxWeb,
  anikoto,
};

export function getProvider(id: string): ProviderModule {
  const provider = providerRegistry[id];
  if (!provider) throw new AppError('NOT_FOUND', `Unknown provider: ${id}`);
  return provider;
}

export function listProviders(): ProviderModule[] {
  return Object.values(providerRegistry);
}
