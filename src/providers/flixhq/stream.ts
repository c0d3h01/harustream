import { throwProviderError } from '../_shared';
import type { ProviderContext, RawStream, RawTextTrack } from '../_shared';
import { providerBaseUrl } from '../_shared';

const BASE_URL = providerBaseUrl('flixhq');

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
    // link format: "episodeId*mediaId"
    const episodeId = link.split('*')[0];
    const mediaId = link.split('*')[1];
    
    if (!episodeId || !mediaId) return [];

    const serversUrl = `${BASE_URL}/servers?episodeId=${episodeId}&mediaId=${mediaId}`;
    const serversRes = await axios.get(serversUrl, { signal });
    const servers = serversRes.data;

    const streams: RawStream[] = [];

    for (const server of servers) {
      const streamUrl = `${BASE_URL}/watch?server=${server.name}&episodeId=${episodeId}&mediaId=${mediaId}`;
      const streamRes = await axios.get(streamUrl, { signal });
      const streamData = streamRes.data;

      const subtitles: RawTextTrack[] = [];
      if (streamData?.subtitles) {
        streamData.subtitles.forEach((sub: any) => {
          subtitles.push({
            title: sub?.lang || 'Undefined',
            language: sub?.lang?.slice(0, 2) || 'und',
            type: 'text/vtt',
            uri: sub?.url,
          });
        });
      }

      if (streamData?.sources?.length > 0) {
        streamData.sources.forEach((source: any) => {
          if (!source?.url) return;
          streams.push({
            server: `${server.name} - ${source.quality?.replace('auto', 'MultiQuality') || 'Auto'}`,
            link: source.url,
            type: source.isM3U8 ? 'm3u8' : 'mp4',
            quality: source.quality,
            subtitles: subtitles.length > 0 ? subtitles : undefined,
          });
        });
      }
    }

    return streams;
  } catch (err) {
    throwProviderError('FlixHQ', 'stream', err);
  }
}