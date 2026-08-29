// ─── FlixHQ Provider ────────────────────────────────────────────────────────
// Movies & series provider. Implements the full ProviderModule contract.

import type { ProviderModule } from '../_shared';
import { providerName } from '../_shared';
import { catalog, genres } from './catalog';
import { getMeta } from './meta';
import { getPosts, getSearchPosts } from './posts';
import { getStream } from './stream';

export const flixhq: ProviderModule = {
  id: 'flixhq',
  name: providerName('flixhq'),
  kind: 'global',
  catalog,
  genres,
  getPosts,
  getSearchPosts,
  getMeta,
  getStream,
};