import type { Subtitle } from '@/types';

/** Map a selected subtitle onto another source's track list: keep the same
 * id when it exists, otherwise fall back to the same language, else off. */
export function remapSubtitleId(
  currentId: string,
  subtitles: Subtitle[],
  language: string | undefined,
): string {
  if (subtitles.some((subtitle) => subtitle.id === currentId)) return currentId;
  if (language) {
    const match = subtitles.find((subtitle) => subtitle.language === language);
    if (match) return match.id;
  }
  return '';
}
