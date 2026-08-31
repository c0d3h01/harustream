import type { ProviderContext, RawStream } from '../_shared';
import { throwProviderError } from '../_shared';

const streamHeaders = {
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

async function hubcloudExtractor(
  link: string,
  signal: AbortSignal,
  axios: ProviderContext['axios'],
  cheerio: ProviderContext['cheerio'],
  commonHeaders: Record<string, string>,
  _ctx: ProviderContext,
  _isDownload?: boolean,
  providerId?: string,
): Promise<RawStream[]> {
  try {
    const res = await axios.get(link, { headers: streamHeaders, signal });
    const $ = cheerio.load(res.data);

    const streamLinks: RawStream[] = [];

    // Find all download/stream buttons
    $('.dwd-button, .btn-outline').each((_, element) => {
      const $el = $(element);
      const parentLink = $el.parent().attr('href');
      const text = $el.text().toLowerCase();

      if (parentLink) {
        const serverName =
          text.replace('download', '').replace('episode', '').replace('watch', '').trim() ||
          'Server';

        streamLinks.push({
          server: serverName,
          link: parentLink,
          type: parentLink.includes('.m3u8') ? 'm3u8' : 'mp4',
          headers: { Referer: link, ...commonHeaders },
        });
      }
    });

    // Also check for direct cloud links
    const cloudLinkMatch = res.data.match(/<a\s+href="([^"]*cloud\.[^"]*)"/i);
    if (cloudLinkMatch?.[1]) {
      streamLinks.push({
        server: 'Cloud',
        link: cloudLinkMatch[1],
        type: 'mp4',
        headers: { Referer: link, ...commonHeaders },
      });
    }

    return streamLinks;
  } catch (error) {
    throwProviderError(providerId || 'Vega', 'stream:hubcloud', error);
  }
}

interface FetchStreamArgs {
  link: string;
  type: string;
  signal?: AbortSignal;
  ctx: ProviderContext;
  isDownload?: boolean;
}

export async function getStream({
  link,
  type,
  signal,
  ctx,
  isDownload,
}: FetchStreamArgs): Promise<RawStream[]> {
  try {
    const { axios, cheerio, commonHeaders } = ctx;

    // If it's a movie and not a cloud link, try to find the cloud link
    if (type === 'movie' && !link.includes('cloud')) {
      const dotlinkRes = await axios.get(link, { headers: streamHeaders, signal });
      const dotlinkText = dotlinkRes.data;

      // Try to find cloud link
      const vlink = dotlinkText.match(/<a\s+href="([^"]*cloud\.[^"]*)"/i) || [];
      if (vlink[1]) {
        link = vlink[1];
      }

      // Check for filepress
      try {
        const $ = cheerio.load(dotlinkText);
        const filepressLink = $(
          '.btn.btn-sm.btn-outline[style="background:linear-gradient(135deg,rgb(252,185,0) 0%,rgb(0,0,0)); color: #fdf8f2;"]',
        )
          .parent()
          .attr('href');

        if (filepressLink) {
          const filepressID = filepressLink?.split('/').pop();
          const filepressBaseUrl = filepressLink?.split('/').slice(0, -2).join('/');

          const filepressTokenRes = await axios.post(
            `${filepressBaseUrl}/api/file/downlaod/`,
            {
              id: filepressID,
              method: 'indexDownlaod',
              captchaValue: null,
            },
            {
              headers: {
                'Content-Type': 'application/json',
                Referer: filepressBaseUrl,
              },
              signal,
            },
          );

          if (filepressTokenRes.data?.status) {
            const filepressToken = filepressTokenRes.data?.data;
            const filepressStreamLink = await axios.post(
              `${filepressBaseUrl}/api/file/downlaod2/`,
              {
                id: filepressToken,
                method: 'indexDownlaod',
                captchaValue: null,
              },
              {
                headers: {
                  'Content-Type': 'application/json',
                  Referer: filepressBaseUrl,
                },
                signal,
              },
            );

            if (filepressStreamLink.data?.data?.[0]) {
              return [
                {
                  server: 'filepress',
                  link: filepressStreamLink.data.data[0],
                  type: 'mkv',
                  headers: { Referer: filepressBaseUrl, ...commonHeaders },
                },
              ];
            }
          }
        }
      } catch {
        // Ignore filepress errors
      }
    }

    return await hubcloudExtractor(
      link,
      signal ?? new AbortController().signal,
      axios,
      cheerio,
      commonHeaders,
      ctx,
      isDownload,
      'Vega',
    );
  } catch (err) {
    throwProviderError('Vega', 'stream', err);
  }
}
