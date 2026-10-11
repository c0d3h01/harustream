'use client';

import { useEffect, useReducer, useRef } from 'react';
import type { StreamVariant } from '@/lib/streaming/types';
import { dashEngine } from './engines/dashEngine';
import { hlsEngine } from './engines/hlsEngine';
import { nativeEngine, supportsNativeHls } from './engines/nativeEngine';
import { type Engine, playerReducer, toPlayerError } from './types';

function engineFor(variant: StreamVariant, video: HTMLVideoElement): Engine {
  if (variant.format === 'hls') return supportsNativeHls(video) ? nativeEngine : hlsEngine;
  if (variant.format === 'mpd') return dashEngine;
  return nativeEngine;
}

/**
 * `video` is the element itself, not a ref: a ref is populated without
 * re-rendering, so an effect keyed on it never re-runs when React mounts or
 * replaces the node. That left the source cleared and never re-attached, and the
 * time display stuck at 0:00.
 */
export function usePlayerEngine(
  video: HTMLVideoElement | null,
  variant: StreamVariant | undefined,
) {
  const [state, dispatch] = useReducer(playerReducer, { status: 'idle' });
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!video) return;

    cleanupRef.current?.();
    cleanupRef.current = null;
    dispatch({ type: 'reset' });

    // Never clear a working source: only replace it when there is a replacement.
    if (variant?.format === 'mkv') {
      dispatch({
        type: 'error',
        error: { kind: 'unsupported', message: 'MKV cannot play directly in browsers' },
      });
      return;
    }
    if (!variant?.playbackHref) return;

    video.removeAttribute('src');
    video.load();
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
  }, [video, variant]);

  useEffect(() => {
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
  }, [video]);

  return state;
}
