import type { SubtitleFormat } from '@/lib/media/streamProxy';

const SUPPORTED_HEADERS = ['referer', 'origin', 'userAgent', 'cookie'] as const;

export type { SubtitleFormat };

export function playbackUrl(
  url: string,
  headers?: Record<string, string>,
  subtitleFormat?: SubtitleFormat,
): string {
  const params = new URLSearchParams({ url });
  if (headers) {
    for (const name of SUPPORTED_HEADERS) {
      const entry = Object.entries(headers).find(
        ([key]) =>
          key.replace(/[-_]/g, '').toLowerCase() === name.replace(/[-_]/g, '').toLowerCase(),
      );
      if (entry?.[1]) params.set(name, entry[1]);
    }
  }
  if (subtitleFormat && subtitleFormat !== 'vtt') {
    params.set('subtitleFormat', subtitleFormat);
  }
  return `/api/proxy?${params.toString()}`;
}
