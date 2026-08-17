'use client';

import Hls from 'hls.js';
import { ChevronLeft, Loader2, Maximize, Play, RotateCcw, Settings, Subtitles } from 'lucide-react';
import { motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DURATIONS } from '@/components/motion';
import { Button } from '@/components/ui/button';
import { type Episode, type Media, resolveStream, type Stream, titleFor } from '@/lib/api/client';
import { useMseStream } from '@/lib/hooks/useMseStream';
import { usePlaybackRate } from '@/lib/hooks/usePlaybackRate';
import { useProgress } from '@/lib/hooks/useProgress';
import { classifySource, playbackUrl } from '@/lib/media/playback';
import { EpisodeList } from './EpisodeList';
import { PlayerSettings } from './PlayerSettings';

type Props = {
  item: Media;
  stream?: Stream;
  episodes: Episode[];
  activeEpisode: string;
  loading: boolean;
  errorMessage?: string;
  defaultPlaybackRate?: number;
  defaultAutoAdvance?: boolean;
  provider: string;
  onClose: () => void;
  onSelectEpisode: (item: Episode) => void;
};

export function PlayerModal({
  item,
  stream,
  episodes,
  activeEpisode,
  loading,
  errorMessage,
  defaultPlaybackRate,
  defaultAutoAdvance,
  provider,
  onClose,
  onSelectEpisode,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const progress = useProgress(provider);
  const { rate, setRate } = usePlaybackRate(defaultPlaybackRate);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(defaultAutoAdvance ?? true);

  const toggleFullscreen = useCallback(() => {
    const host = videoRef.current?.closest('div[class*="relative"]') as
      | HTMLElement
      | null
      | undefined;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    } else if (host) {
      void host.requestFullscreen?.().catch(() => {});
    }
  }, []);

  const resolved = resolveStream(stream);
  const sources = resolved.kind === 'sources' ? resolved.sources : [];
  const [sourceIndex, setSourceIndex] = useState(0);
  const source = sources[sourceIndex]?.link;
  const sourceType = sources[sourceIndex]?.type;

  // A new stream (new title, episode, or quality set) always starts on the
  // first source; otherwise an index left over from a longer list would
  // point past the end and the player would show "no stream".
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally re-runs when the stream changes even though the body only uses the stable setter.
  useEffect(() => {
    setSourceIndex(0);
  }, [stream]);

  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const [stalledMessage, setStalledMessage] = useState<string | null>(null);
  const [resumeOffered, setResumeOffered] = useState(false);
  const [mseStart, setMseStart] = useState(0);

  const savedPosition = source ? progress.get(item.link, activeEpisode)?.position : undefined;

  // Which renderer serves the current source: HLS via hls.js, a natively
  // playable MP4, or the ffmpeg transcode proxy (MKV et al.).
  const kind = classifySource(source ?? '', sourceType);

  // The URL the <video>/hls.js actually fetches. HLS + native go through the
  // server-side stream proxy (Referer/CORS safe, manifest rewritten);
  // transcode sources go through /api/play into MediaSource.
  const playbackSrc = source ? playbackUrl(source, kind) : '';

  // Apply the persisted playback rate whenever it changes or a new source
  // loads. HTMLMediaElement resets playbackRate on src change.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `source`/`kind` are intentionally watched so the rate is re-applied when a new renderer takes over.
  useEffect(() => {
    const video = videoRef.current;
    if (video && Number.isFinite(rate)) video.playbackRate = rate;
  }, [rate, source, kind]);

  const handleError = useCallback((message: string) => {
    setStalledMessage(message);
  }, []);

  const handleReady = useCallback(() => setReady(true), []);
  const handleEnded = useCallback(() => {
    progress.clear(item.link, activeEpisode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.link, activeEpisode, progress.clear]);

  // Native / HLS path (no MSE). Attach source whenever it changes.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playbackSrc || kind === 'transcode') return;

    setReady(false);
    setStalledMessage(null);
    setResumeOffered(false);

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const canNativeHls = video.canPlayType('application/vnd.apple.mpegurl') !== '';
    const useHls = kind === 'hls' && Hls.isSupported() && !canNativeHls;

    if (useHls) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 30,
      });
      hlsRef.current = hls;
      hls.loadSource(playbackSrc);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {});
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          setStalledMessage('This source failed to load. Try another.');
        }
      });
    } else {
      video.src = playbackSrc;
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [playbackSrc, kind]);

  // MSE (transcode proxy) path. Reset the resume offset whenever the source
  // changes so a new title starts from the top.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `source` gates the reset; the body only reads `kind`.
  useEffect(() => {
    if (kind === 'transcode') {
      setReady(false);
      setStalledMessage(null);
      setResumeOffered(false);
      setMseStart(0);
    }
  }, [source, kind]);

  const mse = useMseStream(videoRef, {
    source: kind === 'transcode' && source ? source : '',
    start: mseStart,
    onError: handleError,
    onReady: handleReady,
    onEnded: handleEnded,
  });

  // Save progress periodically while playing.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `progress` is recreated each render; depending on it would tear this effect (and its pending save tick) down constantly. `source` gates it until the <video> mounts.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let frame: number | null = null;

    const tick = () => {
      const p = video.currentTime;
      const d = video.duration;
      if (Number.isFinite(p) && Number.isFinite(d) && d > 0) {
        progress.save(item.link, activeEpisode, p, d, {
          title: titleFor(item),
          poster: item.image ?? undefined,
          type: item.type ?? undefined,
          episodeTitle: episodes.length > 1 ? activeEpisode : undefined,
        });
      }
      frame = window.setTimeout(tick, 4000) as unknown as number;
    };

    const onPlay = () => {
      setPaused(false);
      if (frame === null) tick();
    };
    const onPause = () => {
      setPaused(true);
      if (frame !== null) {
        window.clearTimeout(frame);
        frame = null;
      }
      const p = video.currentTime;
      const d = video.duration;
      progress.save(item.link, activeEpisode, p, d, {
        title: titleFor(item),
        poster: item.image ?? undefined,
        type: item.type ?? undefined,
        episodeTitle: episodes.length > 1 ? activeEpisode : undefined,
      });
    };
    const onEnded = () => {
      progress.clear(item.link, activeEpisode);
      if (frame !== null) {
        window.clearTimeout(frame);
        frame = null;
      }
    };

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEnded);
    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
      if (frame !== null) window.clearTimeout(frame);
    };
    // `progress.save`/`progress.clear` are stable useCallback refs; the
    // `progress` object itself is recreated each render, so depending on it
    // would tear down this effect (and its pending save tick) constantly.
    // `source` gates the effect: the <video> only exists once a source
    // resolves, so we must re-run when it mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.link, activeEpisode, source, progress.save, progress.clear]);

  // Offer resume only once per playback. Setting `currentTime` on a video
  // with `readyState < 1` (HAVE_NOTHING) throws `InvalidStateError` per
  // HTMLMediaElement spec, so we wait for `loadedmetadata` if the user
  // clicks Resume before the source has loaded.
  const offerResume = useCallback(() => {
    if (resumeOffered) return;
    const video = videoRef.current;
    setResumeOffered(true);
    if (kind === 'transcode') {
      // Transcode proxy starts from a server-side offset, so restart the
      // stream at the saved position.
      setMseStart(savedPosition ?? 0);
      return;
    }
    if (!video) return;
    if (!savedPosition || savedPosition < 5) {
      video.play().catch(() => {});
      return;
    }
    const seek = () => {
      video.currentTime = savedPosition;
      video.play().catch(() => {});
    };
    if (video.readyState >= 1) seek();
    else video.addEventListener('loadedmetadata', seek, { once: true });
  }, [resumeOffered, savedPosition, kind]);

  // Auto-advance to next episode on end (series only).
  useEffect(() => {
    const video = videoRef.current;
    if (!video || episodes.length < 2 || !autoAdvance) return;
    const onEnded = () => {
      const idx = episodes.findIndex((e) => e.link === activeEpisode);
      const next = episodes[idx + 1];
      if (next) onSelectEpisode(next);
    };
    video.addEventListener('ended', onEnded);
    return () => video.removeEventListener('ended', onEnded);
  }, [episodes, activeEpisode, onSelectEpisode, autoAdvance]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      if (!resumeOffered) offerResume();
      else video.play().catch(() => {});
    } else {
      video.pause();
    }
  };

  const restart = () => {
    const video = videoRef.current;
    setResumeOffered(true);
    if (kind === 'transcode') {
      setMseStart(0);
      return;
    }
    if (!video) return;
    const seek = () => {
      video.currentTime = 0;
      video.play().catch(() => {});
    };
    if (video.readyState >= 1) seek();
    else video.addEventListener('loadedmetadata', seek, { once: true });
  };

  // Show the resume prompt as long as the user hasn't acted on it.
  const showResumePrompt =
    !!source &&
    !resumeOffered &&
    !stalledMessage &&
    !loading &&
    typeof savedPosition === 'number' &&
    savedPosition >= 5;

  // Lock body scroll while the modal is mounted. Restored on unmount.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const streaming =
    kind === 'transcode' &&
    mse.status !== 'error' &&
    (mse.status === 'loading' || mse.status === 'idle');
  const failed = stalledMessage || (kind === 'transcode' && mse.status === 'error');

  return (
    // AnimatePresence in App drives the enter/exit; transform/opacity only.
    <motion.div
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto overscroll-contain bg-background pt-safe pb-safe"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: DURATIONS.fast }}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-3 p-3 sm:gap-4 sm:p-6 lg:p-8">
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" size="sm" onClick={onClose} className="touch-target shrink-0">
            <ChevronLeft className="size-4" />
            <span className="hidden sm:inline">Back to browse</span>
            <span className="sm:hidden">Back</span>
          </Button>
          <span className="truncate px-2 text-sm font-semibold">{titleFor(item)}</span>
          <span className="size-7 sm:size-16" aria-hidden="true" />
        </div>

        <div className="overflow-hidden rounded-xl bg-black shadow-2xl">
          <div className="relative aspect-video">
            <PlayerSettings
              open={settingsOpen}
              rate={rate}
              onRate={(r) => {
                setRate(r);
              }}
              autoAdvance={autoAdvance}
              onAutoAdvance={setAutoAdvance}
              onFullscreen={toggleFullscreen}
              onRestart={restart}
              onClose={() => setSettingsOpen(false)}
            />
            {source ? (
              <>
                {/* biome-ignore lint/a11y/useMediaCaption: provider streams expose no captions track; the player UI exposes the native controls for captions instead. */}
                <video
                  ref={videoRef}
                  controls={ready}
                  autoPlay={false}
                  playsInline
                  preload="metadata"
                  className="size-full"
                  onCanPlay={() => setReady(true)}
                  onClick={togglePlay}
                  onError={() =>
                    setStalledMessage('This source failed to load. Try another source.')
                  }
                />
                {(!ready || paused) && (
                  <button
                    type="button"
                    onClick={togglePlay}
                    aria-label={paused ? 'Resume' : 'Play'}
                    className="absolute inset-0 grid place-items-center bg-black/40 px-4 transition-opacity"
                  >
                    {failed ? (
                      <span className="text-center text-sm text-muted-foreground">
                        {stalledMessage ?? mse.error}
                      </span>
                    ) : streaming || (!ready && kind === 'transcode') ? (
                      <Loader2 className="size-12 animate-spin text-white/80" />
                    ) : paused ? (
                      <Play className="size-16 fill-white text-white drop-shadow-lg" />
                    ) : null}
                  </button>
                )}
              </>
            ) : (
              <div className="grid size-full place-items-center px-6 text-center text-muted-foreground">
                <div>
                  {failed ? (
                    <p className="text-base font-semibold text-foreground">
                      {stalledMessage ?? mse.error}
                    </p>
                  ) : (
                    <>
                      <Play className="mx-auto mb-3 size-10 text-primary" />
                      <p className="text-sm sm:text-base">
                        {errorMessage ??
                          (loading
                            ? 'Finding the best stream...'
                            : 'No playable stream was returned for this title.')}
                      </p>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="-mx-1 flex flex-wrap gap-2 overflow-x-auto px-1 sm:mx-0 sm:overflow-visible">
            {sources.length > 1 &&
              sources.map((s, i) => (
                <Button
                  key={s.link}
                  size="sm"
                  variant={i === sourceIndex ? 'default' : 'outline'}
                  onClick={() => setSourceIndex(i)}
                  className="touch-target shrink-0"
                >
                  {s.server || `Source ${i + 1}`}
                </Button>
              ))}
            {source && (
              <Button size="sm" variant="ghost" onClick={restart} className="touch-target shrink-0">
                <RotateCcw className="size-3.5" /> Restart
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSettingsOpen(true)}
              className="touch-target shrink-0"
            >
              <Settings className="size-3.5" />
              {rate === 1 ? 'Speed' : `${rate}x`}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={toggleFullscreen}
              className="touch-target shrink-0"
            >
              <Maximize className="size-3.5" /> Fullscreen
            </Button>
          </div>
          <span className="hidden items-center gap-2 text-xs text-muted-foreground sm:inline-flex">
            <Subtitles className="size-3.5" /> Use the player controls for captions
          </span>
        </div>

        {showResumePrompt && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/40 bg-primary/10 p-3 text-sm">
            <span>
              Resume from {Math.floor((savedPosition ?? 0) / 60)}:
              {String(Math.floor((savedPosition ?? 0) % 60)).padStart(2, '0')}?
            </span>
            <div className="flex gap-2">
              <Button size="sm" onClick={offerResume} className="touch-target">
                <Play className="size-3.5" /> Resume
              </Button>
              <Button size="sm" variant="ghost" onClick={restart} className="touch-target">
                Start over
              </Button>
            </div>
          </div>
        )}

        <div className="mt-2 grid gap-4 lg:mt-6 lg:grid-cols-[1fr_280px] lg:gap-6">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold sm:text-2xl">{titleFor(item)}</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {kind === 'transcode'
                ? 'Streaming through the transcoding proxy — playback may start a few seconds after the buffers fill.'
                : 'Direct playback from the selected provider. Episodes advance automatically when one ends.'}
            </p>
          </div>
          <EpisodeList
            episodes={episodes}
            activeEpisode={activeEpisode}
            onSelect={onSelectEpisode}
          />
        </div>
      </div>
    </motion.div>
  );
}
