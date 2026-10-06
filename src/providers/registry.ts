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
  providerOrder.filter((id) => id in providerModules).map((id) => [id, providerModules[id]]),
);

export function getProvider(id: string): ProviderModule {
  const provider = providerRegistry[id];
  if (!provider) throw new Error(`Unknown provider: ${id}`);
  return provider;
}

export function listProviders(): ProviderModule[] {
  return Object.values(providerRegistry);
}

export { providerUrls };
