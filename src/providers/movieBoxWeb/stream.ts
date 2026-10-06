import type { RawStream, RawTextTrack } from '../_shared';
import { throwProviderError } from '../_shared';
import type { PlaybackLink } from './utils';
import { BASE_URL, requestHeaders } from './utils';

type PlayStream = {
  format?: string;
  id?: string;
  url?: string;
  resolutions?: string;
  vipLocked?: boolean;
};

type Caption = {
  lan?: string;
  lanName?: string;
  url?: string;
};

function getQuality(resolutions?: string): RawStream['quality'] {
  const values = (resolutions || '')
    .split(',')
    .map(Number)
    .filter((value) => [360, 480, 720, 1080, 2160].includes(value));
  const quality = Math.max(...values);
  return Number.isFinite(quality) ? (String(quality) as RawStream['quality']) : undefined;
}

function getStreamType(format?: string, url?: string): string {
  const normalized = format?.toUpperCase();
  if (normalized === 'HLS' || normalized === 'M3U8') return 'm3u8';
  if (normalized === 'DASH' || normalized === 'MPD') return 'mpd';
  if (url) {
    const cleanUrl = url.split('?')[0].toLowerCase();
    if (cleanUrl.endsWith('.m3u8')) return 'm3u8';
    if (cleanUrl.endsWith('.mpd')) return 'mpd';
  }
  return 'mp4';
}

function mapCaptions(captions: Caption[]): RawTextTrack[] {
  return captions
    .filter((caption) => Boolean(caption.url))
    .map((caption) => ({
      title: caption.lanName || caption.lan || 'Subtitle',
      language: caption.lan || 'und',
      type: caption.url?.includes('.vtt')
        ? ('text/vtt' as const)
        : ('application/x-subrip' as const),
      uri: caption.url || '',
    }));
}

async function getCaptions(
  baseUrl: string,
  playback: PlaybackLink,
  stream: PlayStream,
  referer: string,
  signal?: AbortSignal,
): Promise<RawTextTrack[]> {
  if (!stream.id || !stream.format) return [];

  const params = new URLSearchParams({
    format: stream.format,
    id: stream.id,
    subjectId: playback.subjectId,
    detailPath: playback.detailPath,
  });
  const url = new URL(`/wefeed-h5api-bff/subject/caption?${params}`, `${baseUrl}/`).toString();
  const response = await fetch(url, {
    headers: { ...(await requestHeaders()), Referer: referer },
    signal,
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText} | URL ${url}`);
  }

  const data = await response.json();
  return mapCaptions(data?.data?.captions || []);
}

export const getStream = async ({
  link,
  signal,
}: {
  link: string;
  signal?: AbortSignal;
}): Promise<RawStream[]> => {
  try {
    const playback = JSON.parse(link) as unknown as PlaybackLink;
    const watchParams = new URLSearchParams({
      id: playback.subjectId,
      type: '/movie/detail',
      detailSe: playback.season ? String(playback.season) : '',
      detailEp: playback.episode ? String(playback.episode) : '',
      lang: 'en',
    });
    const referer = new URL(
      `/movies/${playback.detailPath}?${watchParams}`,
      `${BASE_URL}/`,
    ).toString();
    const playParams = new URLSearchParams({
      subjectId: playback.subjectId,
      detailPath: playback.detailPath,
    });
    if (playback.season && playback.episode) {
      playParams.set('se', String(playback.season));
      playParams.set('ep', String(playback.episode));
    }

    const playUrl = new URL(
      `/wefeed-h5api-bff/subject/play?${playParams}`,
      `${BASE_URL}/`,
    ).toString();
    const response = await fetch(playUrl, {
      headers: { ...(await requestHeaders()), Referer: referer },
      signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText} | URL ${playUrl}`);
    }

    const data = await response.json();
    const playData = data?.data;
    if (data?.code !== 0) {
      throw new Error(data?.message || `MovieBox Web play API code ${data?.code}`);
    }
    if (playData?.hasResource === false) return [];
    if (!playData) throw new Error('MovieBox Web play data was not found');

    const sources = [
      ...(playData.streams || []),
      ...(playData.hls || []),
      ...(playData.dash || []),
    ] as PlayStream[];
    const availableSources = sources.filter((source) => source.url && !source.vipLocked);

    return Promise.all(
      availableSources.map(async (source) => ({
        server: `${playback.language} ${source.resolutions || source.format || ''}`.trim(),
        link: source.url || '',
        type: getStreamType(source.format, source.url),
        quality: getQuality(source.resolutions),
        subtitles: await getCaptions(BASE_URL, playback, source, referer, signal),
      })),
    );
  } catch (error) {
    throwProviderError('MovieBox Web', 'stream', error);
  }
};
