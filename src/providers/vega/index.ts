// ─── Vega Provider ──────────────────────────────────────────────────────────
// Movies provider with per-episode listing and settings.
// Implements the full ProviderModule contract.

import type { ProviderModule } from '../_shared';
import { providerName } from '../_shared';
import { catalog, genres } from './catalog';
import { getEpisodes } from './episodes';
import { getMeta } from './meta';
import { getPosts, getSearchPosts } from './posts';
import { getSettingsSchema } from './settings';
import { getStream } from './stream';

export const vega: ProviderModule = {
  id: 'vega',
  name: providerName('vega'),
  kind: 'movies',
  catalog,
  genres,
  getPosts,
  getSearchPosts,
  getMeta,
  getEpisodes,
  getStream,
  getSettingsSchema,
};