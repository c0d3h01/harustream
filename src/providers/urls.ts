import type { ProviderUrls } from './_shared/types';

/** Provider endpoints kept in typed source so refactors and validation are compile-time visible. */
export const providerUrls = {
  anikoto: { name: 'Anikoto', url: 'https://anikototv.to' },
  torrentio: { name: 'Torrentio', url: 'https://torrentio.strem.fun' },
  movieBoxWeb: { name: 'MovieBox Web', url: 'https://officialmoviebox.com' },
  vega: { name: 'Vega', url: 'https://new2.vegamovies.futbol' },
} satisfies ProviderUrls;

export type ProviderId = keyof typeof providerUrls;
