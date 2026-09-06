// HLS via hls.js, for browsers without native HLS support. hls.js keeps its
// own default backoff/retry behavior for a single flaky segment fetch —
// that's segment-level resilience, not provider fallback, and stays. A
// fatal media error gets exactly one recovery attempt
// (`hls.recoverMediaError()`, hls.js's own documented remedy for a decode
// hiccup); anything beyond that surfaces as a terminal error for the
// player's error UI to handle explicitly, never a silent provider switch.
import type { Engine, PlayerErrorInfo } from '../types';

export const hlsEngine: Engine = async ({ video, variant, onError, signal }) => {
  const { default: Hls } = await import('hls.js');
  if (signal.aborted) return () => {};
  if (!Hls.isSupported()) {
    onError({ kind: 'unsupported', message: 'HLS playback is not supported in this browser' });
    return () => {};
  }

  const hls = new Hls();
  let recoveredMediaError = false;

  hls.on(Hls.Events.ERROR, (_event, data) => {
    if (!data.fatal) return;
    if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !recoveredMediaError) {
      recoveredMediaError = true;
      hls.recoverMediaError();
      return;
    }
    const status = (data.response as { code?: number } | undefined)?.code;
    const error: PlayerErrorInfo =
      status === 401 || status === 403
        ? { kind: 'expired', message: 'Playback link expired', status }
        : {
            kind: data.type === Hls.ErrorTypes.NETWORK_ERROR ? 'network' : 'decode',
            message: data.details,
            status,
          };
    onError(error);
  });

  hls.loadSource(variant.playbackHref ?? '');
  hls.attachMedia(video);

  return () => hls.destroy();
};
