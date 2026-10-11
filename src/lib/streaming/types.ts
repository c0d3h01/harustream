import type { SkipInterval, StreamFormat } from '@/types/media';

export type SubtitleFormat = 'vtt' | 'srt' | 'ttml';

export interface SubtitleTrack {
  id: string;
  label: string;
  language: string;
  format: SubtitleFormat;
  href: string;
}

export interface StreamVariant {
  providerId: string;
  variantId: string;
  format: StreamFormat;
  quality?: string;
  label: string;
  subtitles: SubtitleTrack[];
  skip?: SkipInterval[];
  playbackHref: string;
}

export type ProxyResourceKind = 'manifest' | 'binary';
