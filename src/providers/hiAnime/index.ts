// ─── HiAnime Provider ───────────────────────────────────────────────────────
// Anime provider. Implements the full ProviderModule contract.

import type { ProviderModule } from '../_shared';
import { providerName } from '../_shared';
import { catalog, genres } from './catalog';
import { getMeta } from './meta';
import { getPosts, getSearchPosts } from './posts';
import { getStream } from './stream';

export const hiAnime: ProviderModule = {
  id: 'hiAnime',
  name: providerName('hiAnime'),
  kind: 'anime',
  catalog,
  genres,
  getPosts,
  getSearchPosts,
  getMeta,
  getStream,
};