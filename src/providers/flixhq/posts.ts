import type { ProviderContext, RawPost } from '../_shared';
import { providerBaseUrl } from '../_shared';

const BASE_URL = providerBaseUrl('flixhq');

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

async function parsePosts(data: any): Promise<RawPost[]> {
  const posts: RawPost[] = [];
  const results = data?.results || data;
  results?.map((element: any) => {
    const title = element.title;
    const link = element.id;
    const image = element.image;
    if (title && link && image) {
      posts.push({ title, link, image });
    }
  });
  return posts;
}

export async function getPosts({
  filter,
  page,
  signal,
  ctx,
}: FetchPostsArgs): Promise<RawPost[]> {
  try {
    const { axios } = ctx;
    const url = `${BASE_URL}${filter}?page=${page}`;
    const res = await axios.get(url, { signal });
    return parsePosts(res.data);
  } catch (err) {
    console.error('FlixHQ getPosts error:', err);
    return [];
  }
}

export async function getSearchPosts({
  query,
  page,
  signal,
  ctx,
}: SearchPostsArgs): Promise<RawPost[]> {
  try {
    const { axios } = ctx;
    const url = `${BASE_URL}/search/${query}?page=${page}`;
    const res = await axios.get(url, { signal });
    return parsePosts(res.data);
  } catch (err) {
    console.error('FlixHQ getSearchPosts error:', err);
    return [];
  }
}