import { AppError } from '@/lib/errors';
import type { ProviderModule } from './_shared';
import { anikoto } from './anikoto';
import { providerOrder } from './labels';
import { movieBoxWeb } from './movieBoxWeb';
import { providerUrls } from './urls';

const providerModules: Record<string, ProviderModule> = {
  movieBoxWeb,
  anikoto,
};

export const providerRegistry: Record<string, ProviderModule> = Object.fromEntries(
  providerOrder
    .filter((id) => Object.hasOwn(providerModules, id))
    .map((id) => [id, providerModules[id]]),
);

export function getProvider(id: string): ProviderModule {
  if (!Object.hasOwn(providerRegistry, id))
    throw new AppError('NOT_FOUND', `Unknown provider: ${id}`);
  return providerRegistry[id];
}

export function listProviders(): ProviderModule[] {
  return Object.values(providerRegistry);
}

export { providerUrls };
