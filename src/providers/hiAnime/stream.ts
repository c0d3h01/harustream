import { throwProviderError } from '../_shared';
import type { ProviderContext, RawStream, RawTextTrack } from '../_shared';
import { providerBaseUrl } from '../_shared';

const BASE_URL = providerBaseUrl('hiAnime');

interface FetchStreamArgs {
  link: string;
  type: string;
  signal?: AbortSignal;
  ctx: ProviderContext;
}

export async function getStream({
  link,
  type,
  signal,
  ctx,
}: FetchStreamArgs): Promise<RawStream[]> {
  try {
    const { axios } = ctx;
    // Parse the link which might be "episodeId$sub" or "episodeId$dub"
    const [episodeId, serverType = 'sub'] = link.split('$');
    if (!episodeId) return [];

    const servers = ['vidcloud', 'vidstreaming'];
    const url = `${BASE_URL}/anime/zoro/watch?episodeId=${episodeId}&server=`;
    const streams: RawStream[] = [];

    await Promise.all(
      servers.map(async (server) => {
        try {
          const res = await axios.get(url + server, { signal });
          if (!res.data) return;

          const subtitles: RawTextTrack[] = [];
          res.data?.subtitles?.forEach((sub: any) => {
            if (sub?.lang === 'Thumbnails') return;
            subtitles.push({
              title: sub?.lang || 'Undefined',
              language: sub?.lang?.slice(0, 2) || 'und',
              type: sub?.url?.endsWith('.vtt') ? 'text/vtt' : 'application/x-subrip',
              uri: sub?.url,
            });
          });

          res.data?.sources?.forEach((source: any) => {
            if (!source?.url) return;
            streams.push({
              server,
              link: source.url,
              type: source.isM3U8 ? 'm3u8' : 'mp4',
              quality: source.quality || 'auto',
              headers: {
                Referer: 'https://megacloud.club/',
                Origin: 'https://megacloud.club',
              },
              subtitles: subtitles.length > 0 ? subtitles : undefined,
            });
          });
        } catch (e) {
          // Ignore individual server errors
        }
      }),
    );

    return streams;
  } catch (err) {
    throwProviderError('HiAnime', 'stream', err);
  }
}