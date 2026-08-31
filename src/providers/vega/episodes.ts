import type { ProviderContext, RawEpisodeLink } from '../_shared';
import { throwProviderError } from '../_shared';
import { enrichCinemetaEpisodes, getCinemetaMeta, readCinemetaContext } from './cinemeta';

const episodeHeaders = {
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
    'ext_name=ojplmecpdpgccookcobabopnaifgidhf; cf_clearance=6yZYfXQxBgjaD1eacR5zZCz7njssbxjtSZZCElTOGk0-1764836255-1.2.1.1-bzHvDcDRLp6AAYo7qvGVzJ6Gk6zaqAepuGiGhAWCGYL.ZDpw5yI4TkUIXDgAnEhGCZ9J5X2_OagzgeMHZrd8rzeyAFQXj0dmYMErcfII7_Rhq5kZ4kAtS0tl9PtaNKKd2m4taIufySXCCstl3iNLMODTjbsW_KZi8U8DauOdGSAhBd1DCGxvLlAOM.snfkhb0yQiVJcLW8Bv9IeKQac0ar_TKkV6QexqNZYiyRXnE7E; xla=s4t',
  'Upgrade-Insecure-Requests': '1',
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0',
};

interface FetchEpisodesArgs {
  url: string;
  signal?: AbortSignal;
  ctx: ProviderContext;
}

export async function getEpisodes({
  url,
  signal,
  ctx,
}: FetchEpisodesArgs): Promise<RawEpisodeLink[]> {
  try {
    const { axios, cheerio } = ctx;

    const context = readCinemetaContext(url);

    const res = await axios.get(context.requestUrl, {
      headers: episodeHeaders,
      signal,
    });

    const $ = cheerio.load(res.data);
    const container = $('.entry-content,.entry-inner');
    $('.unili-content,.code-block-1').remove();

    const episodes: RawEpisodeLink[] = [];

    container.find('h4').each((_index, element) => {
      const el = $(element);
      const title = el
        .text()
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^[-:\s]+|[-:\s]+$/g, '')
        .replace(/^episodes?\s*:\s*/i, 'Episode ');

      const link = el
        .next('p')
        .find(
          '.btn-outline[style="background:linear-gradient(135deg,#ed0b0b,#f2d152); color: white;"]',
        )
        .parent()
        .attr('href');

      if (title && link) {
        episodes.push({ title, link });
      }
    });

    const quickDownload = await ctx.kvStore?.get<boolean>('vega_quickDownload');
    const _skipTimings = await ctx.kvStore?.get<boolean>('vega_skipTimings');

    if (!context.imdbId || !context.season) {
      return episodes.map((e) => ({
        ...e,
        quickDownload: quickDownload ?? true,
      }));
    }

    const cinemeta = await getCinemetaMeta(context.imdbId, 'series', ctx);

    const enriched = enrichCinemetaEpisodes(episodes, cinemeta.videos || [], context.season);

    // Skip timings from TheIntroDB would be added here if needed
    // For now we just return enriched episodes

    return enriched.map((e) => ({
      ...e,
      quickDownload: quickDownload ?? true,
    }));
  } catch (err) {
    throwProviderError('Vega', 'episodes', err);
  }
}
