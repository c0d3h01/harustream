import type { ProviderContext, RawPost } from '../_shared';
import { providerBaseUrl, throwProviderError } from '../_shared';

const BASE_URL = providerBaseUrl('vega');

const headers = {
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
  'Cache-Control': 'no-store',
  'Accept-Language': 'en-US,en;q=0.9',
  DNT: '1',
  'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Microsoft Edge";v="120"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  Cookie:
    'xla=s4t; _ga=GA1.1.1081149560.1756378968; _ga_BLZGKYN5PF=GS2.1.s1756378968$o1$g1$t1756378984$j44$l0$h0',
  'Upgrade-Insecure-Requests': '1',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
};

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

async function parsePosts(
  baseUrl: string,
  url: string,
  signal: AbortSignal,
  customHeaders: Record<string, string>,
  _axios: ProviderContext['axios'],
  cheerio: ProviderContext['cheerio'],
): Promise<RawPost[]> {
  try {
    const urlRes = await fetch(url, {
      headers: {
        ...customHeaders,
        Referer: baseUrl,
      },
      signal,
    });
    if (!urlRes.ok) {
      throw new Error(`HTTP ${urlRes.status} ${urlRes.statusText} | URL ${url}`);
    }
    const $ = cheerio.load(await urlRes.text());
    const posts: RawPost[] = [];
    $('.blog-items,.post-list,#archive-container,.movies-grid')
      ?.children('article,.entry-list-item,a')
      ?.each((_index, element) => {
        const href = $(element)?.find('a')?.attr('href') || $(element)?.attr('href') || '';
        const postUrl = new URL(href, `${baseUrl}/`);
        const post = {
          title: (
            $(element)
              ?.find('.entry-title,.poster-title')
              ?.text()
              ?.replace('Download', '')
              ?.match(/^(.*?)\s*\((\d{4})\)|^(.*?)\s*\((Season \d+)\)/)?.[0] ||
            $(element)?.find('a')?.attr('title')?.replace('Download', '') ||
            $(element)?.find('.post-title,.poster-title').text()?.replace('Download', '') ||
            ''
          ).trim(),

          link: `${postUrl.pathname}${postUrl.search}${postUrl.hash}`,
          image:
            $(element).find('a').find('img').attr('data-lazy-src') ||
            $(element).find('a').find('img').attr('data-src') ||
            $(element).find('a').find('img').attr('src') ||
            $(element).find('img').attr('data-src') ||
            $(element).find('img').attr('src') ||
            '',
        };
        if (post.image.startsWith('//')) {
          post.image = `https:${post.image}`;
        }
        if (post.title && post.link) {
          posts.push(post);
        }
      });

    return posts;
  } catch (error) {
    throwProviderError('Vega', 'posts', error);
  }
}

export async function getPosts({ filter, page, signal, ctx }: FetchPostsArgs): Promise<RawPost[]> {
  try {
    const { axios, cheerio } = ctx;

    const url = filter ? `${BASE_URL}/${filter}/page/${page}/` : `${BASE_URL}/page/${page}/`;
    return parsePosts(
      BASE_URL,
      url,
      signal ?? new AbortController().signal,
      headers,
      axios,
      cheerio,
    );
  } catch (_err) {
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

    const url = `${BASE_URL}/search.php?q=${encodeURIComponent(query)}&page=${page}`;

    const response = await axios.get(url, {
      headers: {
        ...headers,
        Referer: BASE_URL,
      },
      signal,
    });

    const data = response.data;
    const posts: RawPost[] = [];

    if (data?.hits) {
      data.hits.forEach((hit: any) => {
        const doc = hit.document;
        const postUrl = new URL(doc.permalink, `${BASE_URL}/`);
        const post = {
          title: doc.post_title.replace('Download', '').trim(),
          link: `${postUrl.pathname}${postUrl.search}${postUrl.hash}`,
          image: doc.post_thumbnail,
        };
        if (post.title && post.link) {
          posts.push(post);
        }
      });
    }
    return posts;
  } catch (_err) {
    return [];
  }
}
