import type { ProviderUrls } from './_shared/types';

/**
 * Order matters: the registry iterates this object, so the first entry is the
 * default source everywhere (fan-out order, `/find` grouping, source pickers).
 */
export const providerUrls: ProviderUrls = {
  movieBoxWeb: {
    name: 'MovieBox Web',
    url: 'https://officialmoviebox.com',
    upstreamHosts: ['*.hakunaymatata.com'],
  },
  anikoto: {
    name: 'Anikoto',
    url: 'https://anikototv.to',
    upstreamHosts: [
      '*.anikototv.to',
      'fetch.nexabloom.top',
      '*.nexabloom.top',
      'megap.shiora.top',
      '*.shiora.top',
      'ncdn.imgnex.top',
      '*.imgnex.top',
      'worker.zendax.me',
      '*.zendax.me',
    ],
  },
};

export const providerOrder: string[] = Object.keys(providerUrls);
