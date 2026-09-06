// DASH via dash.js. DASH's segment-template addressing and manifest
// complexity aren't worth hand-rolling against raw MSE, so this stays a
// thin adapter over the library rather than a native/MSE implementation
// like the other two engines.
import type { Engine } from '../types';

export const dashEngine: Engine = async ({ video, variant, onError, signal }) => {
  const dashjs = await import('dashjs');
  if (signal.aborted) return () => {};

  const player = dashjs.MediaPlayer().create();
  player.on(dashjs.MediaPlayer.events.ERROR, (event) => {
    // dash.js's error codes are its own internal enum, not HTTP status
    // codes (unlike hls.js's fragment-load error, which does carry one) —
    // there's no reliable "expired token" signal to extract here, so every
    // dash.js ERROR surfaces as a network error for the player's error UI.
    const detail =
      typeof event.error === 'object' && event.error !== null ? event.error : undefined;
    onError({ kind: 'network', message: detail?.message ?? 'DASH playback error' });
  });
  player.initialize(video, variant.playbackHref, false);

  return () => player.destroy();
};
