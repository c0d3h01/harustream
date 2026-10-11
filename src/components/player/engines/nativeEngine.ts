import type { Engine } from '../types';

export const nativeEngine: Engine = ({ video, variant }) => {
  video.src = variant.playbackHref ?? '';
  video.load();
  return () => {
    video.removeAttribute('src');
    video.load();
  };
};

export function supportsNativeHls(video: HTMLVideoElement): boolean {
  return video.canPlayType('application/vnd.apple.mpegurl') !== '';
}
