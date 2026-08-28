import { AppError } from '@/lib/errors';
import { anikoto } from './anikoto';
import { Moviesmod } from './Moviesmod';
import { movieBoxWeb } from './movieBoxWeb';
import type { ProviderModule } from './types';
import { adaptVegaProvider } from './vegaAdapter';
import { vegaProviderInventory } from './vegaProviders';

export { vegaProviderInventory };

const nativeProviders: Record<string, ProviderModule> = {
  Moviesmod,
  movieBoxWeb,
  anikoto: adaptVegaProvider(anikoto, {
    status: 'available',
    note: 'Normalized from the Vega-compatible provider contract.',
  }),
};

function createVegaProviderAlias(id: string, name: string): ProviderModule {
  const source = nativeProviders.movieBoxWeb;
  return adaptVegaProvider(
    {
      ...source,
      id,
      name,
      getPosts: source.getPosts,
      getSearchPosts: source.getSearchPosts,
      getMeta: source.getMeta,
      getEpisodes: source.getEpisodes,
      getStream: source.getStream,
    },
    {
      id,
      name,
      status: 'experimental',
      note: 'Vega-compatible fallback adapter; source behavior is inherited from MovieBox until ported.',
    },
  );
}

export const providerRegistry: Record<string, ProviderModule> = {
  ...nativeProviders,
  ...Object.fromEntries(
    vegaProviderInventory
      .filter(({ id }) => !nativeProviders[id])
      .map(({ id, name }) => [id, createVegaProviderAlias(id, name)]),
  ),
};

export function getProvider(id: string): ProviderModule {
  const provider = providerRegistry[id];
  if (!provider) throw new AppError('NOT_FOUND', `Unknown provider: ${id}`);
  return provider;
}

export function listProviders(): ProviderModule[] {
  return Object.values(providerRegistry);
}
