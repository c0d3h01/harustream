// ─── MovieBox Web Provider ──────────────────────────────────────────────────
// Movies & series provider with per-episode listing.
// Implements the full ProviderModule contract.

import type { ProviderModule } from '../_shared';
import { providerName } from '../_shared';
import { catalog, genres } from './catalog';
import { getEpisodes } from './episodes';
import { getMeta } from './meta';
import { getPosts, getSearchPosts } from './posts';
import { getStream } from './stream';

export const movieBoxWeb: ProviderModule = {
  id: 'movieBoxWeb',
  name: providerName('movieBoxWeb'),
  kind: 'global',
  catalog,
  genres,
  getPosts,
  getSearchPosts,
  getMeta,
  getEpisodes,
  getStream,
};
