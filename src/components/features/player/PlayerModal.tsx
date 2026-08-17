'use client';

import {
  isHLSProvider,
  isVideoProvider,
  MediaPlayer,
  MediaProvider,
  type PlayerSrc,
  useMediaProvider,
  useMediaState,
} from '@vidstack/react';
import { DefaultVideoLayout, defaultLayoutIcons } from '@vidstack/react/player/layouts/default';
import { ChevronLeft, Play, RotateCcw } from 'lucide-react';
import { motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import '@vidstack/react/player/styles/default/theme.css';
import '@vidstack/react/player/styles/default/layouts/video.css';
import { DURATIONS } from '@/components/motion/transitions';
import { Button } from '@/components/ui/button';
import { type Episode, type Media, resolveStream, type Stream, titleFor } from '@/lib/api/client';
import { useMseStream } from '@/lib/hooks/useMseStream';
import { PLAYBACK_RATES, usePlaybackRate } from '@/lib/hooks/usePlaybackRate';
import { useProgress } from '@/lib/hooks/useProgress';
import { classifySource, playbackUrl } from '@/lib/media/playback';
import { EpisodeList } from './EpisodeList';

type Props = {
  item: Media;
  stream?: Stream;
  episodes: Episode[];
  activeEpisode: string;
  loading: boolean;
  errorMessage?: string;
  defaultPlaybackRate?: number;
  provider: string;
  onClose: () => void;
  onSelectEpisode: (item: Episode) => void;
};

// Imperative actions the toolbar (outside <MediaPlayer>) triggers on the
// provider-aware bridge — they need the mounted <video> element.
type PlayerActions = { offerResume: () => void; restart: () => void };

type PlayerBridgeProps = {
  kind: ReturnType<typeof classifySource>;
  source: string;
  savedPosition?: number;
  rate: number;
  setRate: (rate: number) => void;
  autoAdvance: boolean;
  stalledMessage: string | null;
  setStalledMessage: (message: string | null) => void;
  resumeOffered: boolean;
  setResumeOffered: (offered: boolean) => void;
  actionsRef: { current: PlayerActions | null };
  progress: ReturnType<typeof useProgress>;
  item: Media;
  episodes: Episode[];
  activeEpisode: string;
  onSelectEpisode: (episode: Episode) => void;
  onEnded: () => void;
};

// Must be rendered as a child of <MediaPlayer> so the media context hooks
// resolve. Hosts the MSE (transcode) pipeline and every effect that needs
// the provider's <video> element, and renders the fail-loud overlay.
function PlayerBridge({
  kind,
  source,
  savedPosition,
  rate,
  setRate,
  autoAdvance,
  stalledMessage,
  setStalledMessage,
  resumeOffered,
  setResumeOffered,
  actionsRef,
  progress,
  item,
  episodes,
  activeEpisode,
  onSelectEpisode,
  onEnded,
}: PlayerBridgeProps) {
  const [mseStart, setMseStart] = useState(0);

  // Vidstack mounts a real <video> element inside MediaProvider. Both the
  // video and hls providers expose it.
  const providerInstance = useMediaProvider();
  const video = isVideoProvider(providerInstance)
    ? providerInstance.video
    : isHLSProvider(providerInstance)
      ? providerInstance.video
      : null;

  const mediaRate = useMediaState('playbackRate');

  // Persist a rate chosen inside the layout's settings menu. The layout
  // dispatches rate-change requests onto the element; mirror those back into
  // localStorage so the preference survives reloads and applies to the next
  // title.
  useEffect(() => {
    if (mediaRate !== rate && PLAYBACK_RATES.includes(mediaRate)) setRate(mediaRate);
  }, [mediaRate, rate, setRate]);

  // Apply the persisted playback rate whenever it changes or a new source
  // loads. HTMLMediaElement resets playbackRate on src change.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `source`/`kind` are intentionally watched so the rate is re-applied when a new renderer takes over.
  useEffect(() => {
    if (video && Number.isFinite(rate) && video.playbackRate !== rate) {
      video.playbackRate = rate;
    }
  }, [video, rate, source, kind]);

  // MSE (transcode proxy) path. Reset the resume offset whenever the source
  // changes so a new title starts from the top.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `source` is intentionally watched — a source change where `kind` stays `transcode` must still reset the offset.
  useEffect(() => {
    if (kind === 'transcode') {
      setStalledMessage(null);
      setResumeOffered(false);
      setMseStart(0);
    }
  }, [source, kind, setStalledMessage, setResumeOffered]);

  const mse = useMseStream(video, {
    source: kind === 'transcode' && source ? source : '',
    start: mseStart,
    onError: setStalledMessage,
    onEnded,
  });

  // Save progress periodically while playing.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the `progress` object is recreated each render; depending on it would tear this effect (and its pending save tick) down constantly. Its `save`/`clear` members are stable useCallback refs (see useProgress). `video` gates the effect until the provider mounts the element.
  useEffect(() => {
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
      if (frame === null) tick();
    };
    const onPause = () => {
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
    const onEndedEvent = () => {
      progress.clear(item.link, activeEpisode);
      if (frame !== null) {
        window.clearTimeout(frame);
        frame = null;
      }
    };

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEndedEvent);
    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEndedEvent);
      if (frame !== null) window.clearTimeout(frame);
    };
  }, [video, item.link, activeEpisode, episodes.length, progress.save, progress.clear]);

  // Auto-advance to next episode on end (series only).
  useEffect(() => {
    if (!video || episodes.length < 2 || !autoAdvance) return;
    const onEndedEvent = () => {
      const idx = episodes.findIndex((e) => e.link === activeEpisode);
      const next = episodes[idx + 1];
      if (next) onSelectEpisode(next);
    };
    video.addEventListener('ended', onEndedEvent);
    return () => video.removeEventListener('ended', onEndedEvent);
  }, [video, episodes, activeEpisode, onSelectEpisode, autoAdvance]);

  // Offer resume only once per playback. Setting `currentTime` on a video
  // with `readyState < 1` (HAVE_NOTHING) throws `InvalidStateError` per
  // HTMLMediaElement spec, so we wait for `loadedmetadata` if the user
  // clicks Resume before the source has loaded.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `setMseStart` is used in the transcode branch; biome's rule drops deps used only inside an early-returning branch (false positive).
  const offerResume = useCallback(() => {
    if (resumeOffered) return;
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
  }, [resumeOffered, savedPosition, kind, video, setResumeOffered, setMseStart]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `setMseStart` is used in the transcode branch; biome's rule drops deps used only inside an early-returning branch (false positive).
  const restart = useCallback(() => {
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
  }, [kind, video, setResumeOffered, setMseStart]);

  // Expose resume/restart to the toolbar buttons rendered outside the player.
  useEffect(() => {
    actionsRef.current = { offerResume, restart };
  }, [actionsRef, offerResume, restart]);

  const failed = stalledMessage || (kind === 'transcode' && mse.status === 'error');
  if (!failed) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-black/40 px-4">
      <span className="text-center text-sm text-muted-foreground">
        {stalledMessage ?? mse.error}
      </span>
    </div>
  );
}

export function PlayerModal({
  item,
  stream,
  episodes,
  activeEpisode,
  loading,
  errorMessage,
  defaultPlaybackRate,
  provider,
  onClose,
  onSelectEpisode,
}: Props) {
  const progress = useProgress(provider);
  const { rate, setRate } = usePlaybackRate(defaultPlaybackRate);

  const [stalledMessage, setStalledMessage] = useState<string | null>(null);
  const [resumeOffered, setResumeOffered] = useState(false);
  const actionsRef = useRef<PlayerActions | null>(null);

  const resolved = resolveStream(stream);
  const sources = resolved.kind === 'sources' ? resolved.sources : [];
  const [sourceIndex, setSourceIndex] = useState(0);
  const source = sources[sourceIndex]?.link;

  // A new stream (new title, episode, or quality set) always starts on the
  // first source; otherwise an index left over from a longer list would
  // point past the end and the player would show "no stream".
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally re-runs when the stream changes even though the body only uses the stable setter.
  useEffect(() => {
    setSourceIndex(0);
    setStalledMessage(null);
    setResumeOffered(false);
  }, [stream]);

  const savedPosition = source ? progress.get(item.link, activeEpisode)?.position : undefined;

  // Which renderer serves the current source: HLS via Vidstack's internal
  // hls.js, a natively playable MP4, or the ffmpeg transcode proxy (MKV et al.).
  const kind = classifySource(source ?? '', undefined);

  // The URL the player actually fetches. HLS + native go through the
  // server-side stream proxy (Referer/CORS safe, manifest rewritten);
  // transcode sources go through /api/play into MediaSource.
  const playbackSrc = source ? playbackUrl(source, kind) : '';

  // Vidstack resolves its media provider from the `src` prop — with no src
  // no <video> element is ever mounted. The transcode path therefore needs a
  // placeholder src so the video provider mounts; `type: "?"` is Vidstack's
  // unknown-type marker (skips MIME probing) and preload="none" stops the
  // browser from fetching it. The MSE pipeline replaces it with a MediaSource
  // blob URL before anything can load. The runtime accepts `"?"` even though
  // the TS `Src` union doesn't list it.
  const playerSrc: PlayerSrc =
    kind === 'transcode'
      ? ({ src: 'placeholder.mp4', type: '?' } as unknown as PlayerSrc)
      : playbackSrc;

  const handleEnded = useCallback(() => {
    progress.clear(item.link, activeEpisode);
  }, [item.link, activeEpisode, progress.clear]);

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
            {source ? (
              <MediaPlayer
                src={playerSrc}
                title={titleFor(item)}
                poster={item.image ?? undefined}
                playsInline
                aspectRatio="16/9"
                playbackRate={rate}
                preload={kind === 'transcode' ? 'none' : undefined}
                onError={(detail) => {
                  // Transcode errors surface through the MSE hook instead —
                  // the placeholder src can race a not-yet-attached MediaSource.
                  if (kind === 'transcode') return;
                  if (sourceIndex < sources.length - 1) {
                    setStalledMessage(null);
                    setResumeOffered(false);
                    setSourceIndex((index) => index + 1);
                    return;
                  }
                  setStalledMessage(
                    detail?.message || 'This source failed to load. Try another source.',
                  );
                }}
              >
                <MediaProvider />
                <DefaultVideoLayout
                  icons={defaultLayoutIcons}
                  colorScheme="dark"
                  playbackRates={PLAYBACK_RATES}
                />
                <PlayerBridge
                  kind={kind}
                  source={source}
                  savedPosition={savedPosition}
                  rate={rate}
                  setRate={setRate}
                  autoAdvance={true}
                  stalledMessage={stalledMessage}
                  setStalledMessage={setStalledMessage}
                  resumeOffered={resumeOffered}
                  setResumeOffered={setResumeOffered}
                  actionsRef={actionsRef}
                  progress={progress}
                  item={item}
                  episodes={episodes}
                  activeEpisode={activeEpisode}
                  onSelectEpisode={onSelectEpisode}
                  onEnded={handleEnded}
                />
              </MediaPlayer>
            ) : (
              <div className="grid size-full place-items-center px-6 text-center text-muted-foreground">
                <div>
                  {stalledMessage ? (
                    <p className="text-base font-semibold text-foreground">{stalledMessage}</p>
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

        {source && (
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => actionsRef.current?.restart()}
              className="touch-target"
            >
              <RotateCcw className="size-3.5" /> Start over
            </Button>
          </div>
        )}

        {showResumePrompt && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/40 bg-primary/10 p-3 text-sm">
            <span>
              Resume from {Math.floor((savedPosition ?? 0) / 60)}:
              {String(Math.floor((savedPosition ?? 0) % 60)).padStart(2, '0')}?
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => actionsRef.current?.offerResume()}
                className="touch-target"
              >
                <Play className="size-3.5" /> Resume
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => actionsRef.current?.restart()}
                className="touch-target"
              >
                Start over
              </Button>
            </div>
          </div>
        )}

        <div className="mt-2 grid gap-4 lg:mt-6 lg:grid-cols-[1fr_280px] lg:gap-6">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold sm:text-2xl">{titleFor(item)}</h1>
            {episodes.length === 0 && loading && (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Getting this ready to watch…
              </p>
            )}
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
