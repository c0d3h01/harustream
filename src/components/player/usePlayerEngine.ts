'use client';

// Owns the media element's lifecycle. The teardown contract this hook
// enforces is the direct fix for the previous player's cross-source bleed:
// switching variants or unmounting always runs, in this order — abort the
// in-flight attach, run the active engine's own cleanup, flush the
// element's buffered state (`removeAttribute('src')` + `load()`, which
// releases hls.js/dash.js's MSE `SourceBuffer`s too, since their cleanup
// runs first), then reset state. Only after all of that does the next
// variant's engine ever attach — no attach ever overlaps a previous one's
// teardown.
import { useEffect, useReducer, useRef } from 'react';
import type { StreamVariant } from '@/types';
import { dashEngine } from './engines/dashEngine';
import { hlsEngine } from './engines/hlsEngine';
import { nativeEngine, supportsNativeHls } from './engines/nativeEngine';
import { type Engine, playerReducer, toPlayerError } from './types';

function engineFor(variant: StreamVariant, video: HTMLVideoElement): Engine {
  if (variant.format === 'hls') return supportsNativeHls(video) ? nativeEngine : hlsEngine;
  if (variant.format === 'mpd') return dashEngine;
  return nativeEngine;
}

export function usePlayerEngine(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  variant: StreamVariant | undefined,
) {
  const [state, dispatch] = useReducer(playerReducer, { status: 'idle' });
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    cleanupRef.current?.();
    cleanupRef.current = null;
    video.removeAttribute('src');
    video.load();
    dispatch({ type: 'reset' });

    if (!variant?.playbackHref) return;
    // MKV (Matroska) has no native <video> support in any browser —
    // without this guard the element stalls forever on loading instead
    // of surfacing the existing unsupported-format error UI.
    if (variant.format === 'mkv') {
      dispatch({
        type: 'error',
        error: { kind: 'unsupported', message: 'MKV cannot play directly in browsers' },
      });
      return;
    }
    dispatch({ type: 'loading' });

    const controller = new AbortController();
    let disposed = false;

    void (async () => {
      const engine = engineFor(variant, video);
      try {
        const cleanup = await engine({
          video,
          variant,
          onError: (error) => {
            if (!disposed) dispatch({ type: 'error', error });
          },
          signal: controller.signal,
        });
        if (disposed || controller.signal.aborted) {
          cleanup();
          return;
        }
        cleanupRef.current = cleanup;
      } catch (error) {
        if (!disposed) dispatch({ type: 'error', error: toPlayerError(error) });
      }
    })();

    return () => {
      disposed = true;
      controller.abort();
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [variant, videoRef]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onPlaying = () => dispatch({ type: 'playing' });
    const onPause = () => dispatch({ type: 'paused' });
    const onWaiting = () => dispatch({ type: 'waiting' });
    const onCanPlay = () => dispatch({ type: 'ready' });
    const onStalled = () => dispatch({ type: 'stalled' });
    const onVideoError = () =>
      dispatch({ type: 'error', error: { kind: 'unknown', message: 'Playback error' } });
    video.addEventListener('playing', onPlaying);
    video.addEventListener('pause', onPause);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('stalled', onStalled);
    video.addEventListener('error', onVideoError);
    return () => {
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('stalled', onStalled);
      video.removeEventListener('error', onVideoError);
    };
  }, [videoRef]);

  return state;
}
