import type { StreamSource } from '@/types';

export type PlaybackEngine = 'native' | 'hls';

export function chooseEngine(
  source: StreamSource,
  canPlayNative: (mimeType: string) => boolean = () => false,
): PlaybackEngine {
  if (source.format === 'hls' && !canPlayNative('application/vnd.apple.mpegurl')) return 'hls';
  return 'native';
}
