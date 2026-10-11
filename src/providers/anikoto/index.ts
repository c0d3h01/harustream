import type { ProviderModule } from '../_shared';
import { providerName } from '../_shared';
import { getMeta } from './meta';
import { getSearchPosts } from './posts';
import { getStream } from './stream';

export const anikoto: ProviderModule = {
  id: 'anikoto',
  name: providerName('anikoto'),
  getSearchPosts,
  getMeta,
  getStream,
};
