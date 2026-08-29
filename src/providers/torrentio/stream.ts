import { throwProviderError } from '../_shared';
import type { ProviderContext, RawStream } from '../_shared';
import { providerBaseUrl } from '../_shared';

const BASE_URL = providerBaseUrl('torrentio');

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
    // link format: "movie:tmdbId" or "tv:tmdbId:season:episode"
    const url = `${BASE_URL}/stream/${link}`;
    const res = await axios.get(url, { signal });
    const data = res.data;

    const streams: RawStream[] = [];
    data?.streams?.forEach((stream: any) => {
      if (!stream.url) return;
      
      const title = stream.title || 'Torrent';
      const quality = extractQuality(title);
      
      streams.push({
        server: 'Torrentio',
        link: stream.url,
        type: stream.url.includes('.m3u8') ? 'm3u8' : 'webtorrent',
        quality,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });
    });

    return streams;
  } catch (err) {
    throwProviderError('Torrentio', 'stream', err);
  }
}

function extractQuality(title: string): string {
  const match = title.match(/(\d{3,4}p|4K|2160p|1080p|720p|480p|360p)/i);
  return match ? match[1].toUpperCase() : 'auto';
}