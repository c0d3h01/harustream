import type { ProviderModule } from '../types';
import { providerName } from '../urls';
import { catalog, genres } from './catalog';
import { getMeta as upstreamMeta } from './meta';
import { getPosts as upstreamPosts, getSearchPosts as upstreamSearch } from './posts';
import { getStream as upstreamStream } from './stream';

export const anikoto: ProviderModule = {
  id: 'anikoto',
  name: providerName('anikoto'),
  kind: 'anime',
  catalog,
  genres,
  getPosts: ({ filter, page, signal, ctx }) =>
    upstreamPosts({
      filter,
      page,
      signal: signal ?? new AbortController().signal,
      providerContext: ctx,
    }),
  getSearchPosts: ({ query, page, signal, ctx }) =>
    upstreamSearch({
      searchQuery: query,
      page,
      signal: signal ?? new AbortController().signal,
      providerContext: ctx,
    }),
  getMeta: ({ link, signal, ctx }) => upstreamMeta({ link, signal, providerContext: ctx }),
  getStream: ({ link, type, signal, ctx }) =>
    upstreamStream({
      link,
      type,
      signal: signal ?? new AbortController().signal,
      providerContext: ctx,
    }),
};
