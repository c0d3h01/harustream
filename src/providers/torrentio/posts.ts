import type { ProviderContext, RawPost } from '../_shared';

interface FetchPostsArgs {
  filter: string;
  page: number;
  signal?: AbortSignal;
  ctx: ProviderContext;
}

interface SearchPostsArgs {
  query: string;
  page: number;
  signal?: AbortSignal;
  ctx: ProviderContext;
}

export async function getPosts({
  filter: _filter,
  page: _page,
  signal: _signal,
  ctx: _ctx,
}: FetchPostsArgs): Promise<RawPost[]> {
  // Torrentio is a Stremio addon with no catalogs - cannot browse
  // Return empty array for catalog browsing
  return [];
}

export async function getSearchPosts({
  query: _query,
  page: _page,
  signal: _signal,
  ctx: _ctx,
}: SearchPostsArgs): Promise<RawPost[]> {
  // Torrentio doesn't support search either
  return [];
}
