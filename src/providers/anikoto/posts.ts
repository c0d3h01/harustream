import * as cheerio from 'cheerio';
import type { RawPost } from '../_shared';
import { commonHeaders, providerBaseUrl, throwProviderError } from '../_shared';

export const getSearchPosts = async ({
  query,
  page,
  signal,
}: {
  query: string;
  page: number;
  signal?: AbortSignal;
}): Promise<RawPost[]> => {
  try {
    const baseUrl = providerBaseUrl('anikoto');
    const url = new URL(
      `/filter?keyword=${encodeURIComponent(query.trim())}&page=${page}`,
      baseUrl,
    );

    const response = await fetch(url.toString(), {
      headers: { ...commonHeaders, Referer: `${baseUrl}/` },
      signal,
    });

    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);

    const html = await response.text();
    const $ = cheerio.load(html);
    const posts: RawPost[] = [];

    $('.ani.items .item, .items .item, div.item').each((_, el) => {
      const title =
        $(el).find('.info a.name, .info a.d-title, a.name.d-title').first().text().trim() ||
        $(el).find('.info a.name, a.name.d-title').first().attr('data-jp') ||
        $(el).find('img').attr('alt') ||
        '';

      const linkEl = $(el)
        .find('.info a.name, .info a.d-title, .poster a, a[href*="/watch/"]')
        .first();
      let href = linkEl.attr('href') || '';
      if (!href) return;

      if (!href.startsWith('http')) {
        href = new URL(href, baseUrl).toString();
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
    return throwProviderError('Anikoto', 'search', err);
  }
};
