// ─── MovieBox Web Provider ──────────────────────────────────────────────────
// Movies & series provider with per-episode listing.

import type { ProviderModule } from '../_shared';
import { providerName } from '../_shared';
import { getEpisodes } from './episodes';
import { getMeta } from './meta';
import { getSearchPosts } from './posts';
import { getStream } from './stream';

export const movieBoxWeb: ProviderModule = {
  id: 'movieBoxWeb',
  name: providerName('movieBoxWeb'),
  getSearchPosts,
  getMeta,
  getEpisodes,
  getStream,
};
