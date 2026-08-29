import type { Post, ProviderContext } from '../_shared';
import { providerBaseUrl } from '../_shared';

const BASE_URL = providerBaseUrl('anikoto');

export const getPosts = async ({
  filter,
  page,
  signal,
  ctx,
}: {
  filter: string;
  page: number;
  signal?: AbortSignal;
  ctx: ProviderContext;
}): Promise<Post[]> => {
  try {
    const { axios, cheerio } = ctx;
    const delimiter = filter.includes('?') ? '&' : '?';
    const url = `${BASE_URL}${filter}${delimiter}page=${page}`;

    const res = await axios.get(url, {
      headers: {
        ...ctx.commonHeaders,
        Referer: `${BASE_URL}/`,
      },
      signal,
    });

    const $ = cheerio.load(res.data);
    const posts: Post[] = [];

    $('.ani.items .item, .items .item, div.item').each((_, el) => {
      // Find the specific title in .info or img alt
      const title =
        $(el).find('.info a.name, .info a.d-title, a.name.d-title').first().text().trim() ||
        $(el).find('.info a.name, a.name.d-title').first().attr('data-jp') ||
        $(el).find('img').attr('alt') ||
        '';

      // Find the watch link
      const linkEl = $(el)
        .find(".info a.name, .info a.d-title, .poster a, a[href*='/watch/']")
        .first();
      let href = linkEl.attr('href') || '';
      if (!href) return;

      if (!href.startsWith('http')) {
        href = `${BASE_URL}${href.startsWith('/') ? '' : '/'}${href}`;
      }

      const image = $(el).find('img').attr('src') || '';

      if (title && href) {
        posts.push({
          title,
          link: href,
          image,
        });
      }
    });

    return posts;
  } catch (err) {
    console.error('Anikoto getPosts error:', err);
    return [];
  }
};

export const getSearchPosts = async ({
  query,
  page,
  signal,
  ctx,
}: {
  query: string;
  page: number;
  signal?: AbortSignal;
  ctx: ProviderContext;
}): Promise<Post[]> => {
  try {
    const { axios, cheerio } = ctx;
    const url = `${BASE_URL}/filter?keyword=${encodeURIComponent(query)}&page=${page}`;

    const res = await axios.get(url, {
      headers: {
        ...ctx.commonHeaders,
        Referer: `${BASE_URL}/`,
      },
      signal,
    });

    const $ = cheerio.load(res.data);
    const posts: Post[] = [];

    $('.ani.items .item, .items .item, div.item').each((_, el) => {
      const title =
        $(el).find('.info a.name, .info a.d-title, a.name.d-title').first().text().trim() ||
        $(el).find('.info a.name, a.name.d-title').first().attr('data-jp') ||
        $(el).find('img').attr('alt') ||
        '';

      const linkEl = $(el)
        .find(".info a.name, .info a.d-title, .poster a, a[href*='/watch/']")
        .first();
      let href = linkEl.attr('href') || '';
      if (!href) return;

      if (!href.startsWith('http')) {
        href = `${BASE_URL}${href.startsWith('/') ? '' : '/'}${href}`;
      }

      const image = $(el).find('img').attr('src') || '';

      if (title && href) {
        posts.push({
          title,
          link: href,
          image,
        });
      }
    });

    return posts;
  } catch (err) {
    console.error('Anikoto getSearchPosts error:', err);
    return [];
  }
};
