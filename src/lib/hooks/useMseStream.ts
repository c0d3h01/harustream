'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { playbackUrl } from '@/lib/media/playback';

// Plays a source through MediaSource (MSE). The server side (/api/play)
// remuxes/transcodes MKV → fragmented MP4, so the SourceBuffer is always
// "video/mp4; codecs=<X-Haru-Codec header>". Bytes are appended as they
// arrive; a queue waits for `updateend` before appending the next chunk so
// we never race the SourceBuffer's internal update cycle.

type Options = {
  source: string;
  start?: number;
  onError?: (message: string) => void;
  onReady?: () => void;
  onEnded?: () => void;
};

type Status = 'idle' | 'loading' | 'playing' | 'error';

export function useMseStream(
  video: HTMLVideoElement | null,
  { source, start = 0, onError, onReady, onEnded }: Options,
) {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  const cbRef = useRef({ onError, onReady, onEnded });
  cbRef.current = { onError, onReady, onEnded };

  useEffect(() => {
    if (!video || !source) return;

    const controller = new AbortController();
    let destroyed = false;
    let mediaSource: MediaSource | null = null;
    let objectUrl: string | null = null;
    let sourceBuffer: SourceBuffer | null = null;
    const queue: ArrayBuffer[] = [];
    let appending = false;
    let fetchDone = false;
    let check: ReturnType<typeof setInterval> | undefined;

    setStatus('loading');
    setError(null);

    const fail = (message: string) => {
      if (destroyed) return;
      setStatus('error');
      setError(message);
      cbRef.current.onError?.(message);
      controller.abort();
    };

    const drain = () => {
      if (destroyed || appending || !sourceBuffer) return;
      if (queue.length === 0) {
        if (fetchDone && mediaSource && mediaSource.readyState === 'open') {
          try {
            mediaSource.endOfStream();
          } catch {}
        }
        return;
      }
      const chunk = queue.shift();
      if (chunk === undefined) return;
      appending = true;
      try {
        sourceBuffer.appendBuffer(chunk);
      } catch (e) {
        appending = false;
        fail(e instanceof Error ? e.message : 'Failed to buffer stream');
      }
    };

    const startPlayback = () => {
      if (destroyed || !video || !sourceBuffer) return;
      try {
        if (sourceBuffer.buffered.length > 0) {
          const end = sourceBuffer.buffered.end(sourceBuffer.buffered.length - 1);
          if (end > 0.5) {
            setStatus('playing');
            cbRef.current.onReady?.();
            // Nothing left to wait for — stop polling the buffer.
            if (check !== undefined) {
              clearInterval(check);
              check = undefined;
            }
            if (video.paused) video.play().catch(() => {});
          }
        }
      } catch {}
    };

    const run = async () => {
      const url = playbackUrl(source, 'transcode', start);
      let res: Response;
      try {
        res = await fetch(url, { signal: controller.signal });
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        fail('Stream request failed');
        return;
      }
      if (!res.ok) {
        fail(`Stream request failed (${res.status})`);
        return;
      }
      const codec = res.headers.get('X-Haru-Codec');
      if (!codec || !res.body) {
        fail('Stream did not advertise a playable codec');
        return;
      }
      const body = res.body;
      const durationHeader = Number(res.headers.get('X-Haru-Duration'));

      // Now that we know the codec, wire up MediaSource and its SourceBuffer.
      mediaSource = new MediaSource();
      objectUrl = URL.createObjectURL(mediaSource);
      video.src = objectUrl;

      const onOpen = () => {
        if (destroyed || !mediaSource) return;
        try {
          // addSourceBuffer() must run before touching `duration`: the MSE
          // spec forbids setting a non-NaN duration while the MediaSource has
          // no source buffers and throws InvalidStateError (which would stall
          // playback with a perpetual loading spinner).
          sourceBuffer = mediaSource.addSourceBuffer(`video/mp4; codecs="${codec}"`);
          // The server reports the real length (from ffprobe) so `video.duration`
          // is finite and progress can be persisted even though the byte stream
          // arrives unbounded from a long-running transcode.
          if (Number.isFinite(durationHeader) && durationHeader > 0) {
            mediaSource.duration = durationHeader;
          }
        } catch {
          fail('Your browser cannot decode this stream');
          return;
        }
        sourceBuffer.addEventListener('updateend', () => {
          appending = false;
          drain();
        });
        void pump(body);
      };

      if (mediaSource.readyState === 'open') {
        onOpen();
      } else {
        mediaSource.addEventListener('sourceopen', onOpen);
      }
    };

    const pump = async (body: ReadableStream<Uint8Array>) => {
      const reader = body.getReader();
      try {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (destroyed) {
            await reader.cancel().catch(() => {});
            return;
          }
          queue.push(
            value.buffer.slice(
              value.byteOffset,
              value.byteOffset + value.byteLength,
            ) as ArrayBuffer,
          );
          drain();
        }
        fetchDone = true;
        drain();
      } catch (e) {
        // A teardown abort races the in-flight read; that is not a playback
        // error. Otherwise surface the read failure through `fail`.
        if (destroyed) return;
        if (e instanceof DOMException && e.name === 'AbortError') return;
        fail(e instanceof Error ? e.message : 'Stream read failed');
      }
    };

    void run();

    const onTimeUpdate = () => startPlayback();
    video.addEventListener('timeupdate', onTimeUpdate);
    check = setInterval(startPlayback, 200);

    return () => {
      destroyed = true;
      if (check !== undefined) clearInterval(check);
      video.removeEventListener('timeupdate', onTimeUpdate);
      controller.abort();
      try {
        if (mediaSource && mediaSource.readyState === 'open') {
          mediaSource.endOfStream();
        }
      } catch {}
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      video.removeAttribute('src');
      video.load();
    };
  }, [video, source, start]);

  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
  }, []);

  return { status, error, reset };
}
