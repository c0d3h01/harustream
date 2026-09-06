// Progressive mp4/mkv/other, and HLS on browsers with native HLS support
// (Safari) — the browser's own media pipeline, no library involved. This is
// the lowest-latency path where it applies: no JS-driven segment fetching
// or buffer management sits between the network and the decoder.
import type { Engine } from '../types';

export const nativeEngine: Engine = ({ video, variant }) => {
  video.src = variant.playbackHref ?? '';
  video.load();
  return () => {
    video.removeAttribute('src');
    video.load();
  };
};

/** Safari reports HLS support through `canPlayType`; every other engine
 *  decision in `usePlayerEngine.ts` is format-based, this is the one
 *  browser-capability check. */
export function supportsNativeHls(video: HTMLVideoElement): boolean {
  return video.canPlayType('application/vnd.apple.mpegurl') !== '';
}
