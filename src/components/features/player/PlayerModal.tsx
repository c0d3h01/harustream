'use client';

import { MediaPlayer, MediaProvider, type PlayerSrc } from '@vidstack/react';
import { RotateCw } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SPRING_SOFT } from '@/components/motion/transitions';
import {
  type AudioLanguage,
  type Episode,
  type HubQuality,
  type Media,
  resolveStream,
  type Stream,
  type SubtitleTrack,
  subtitleTracksFrom,
  titleFor,
} from '@/lib/api/client';
import { usePlaybackRate } from '@/lib/hooks/usePlaybackRate';
import { useProgress } from '@/lib/hooks/useProgress';
import { useScrollLock } from '@/lib/hooks/useScrollLock';
import { imageUrl } from '@/lib/media/images';
import { playbackUrl } from '@/lib/media/playback';
import { PlayerStage } from './PlayerStage';

type Props = {
  item: Media;
  stream?: Stream;
  episodes: Episode[];
  activeEpisode: string;
  loading: boolean;
  errorMessage?: string;
  audioLanguages?: AudioLanguage[];
  audioLanguage?: string;
  onSelectLanguage?: (label: string) => void;
  hubQualities?: HubQuality[];
  hubQuality?: string;
  onSelectQuality?: (label: string) => void;
  defaultPlaybackRate?: number;
  autoAdvance: boolean;
  provider: string;
  onClose: () => void;
  onSelectEpisode: (item: Episode) => void;
  onSourcesExhausted: () => void;
};

// A source that stalls this long without loading metadata is dead — fall
// through to the next source instead of hanging the player.
const SOURCE_STALL_TIMEOUT_MS = 20_000;

// The player is a pure immersive surface: the video fills the viewport on
// black and every control lives inside PlayerStage (back, play/pause, seek,
// episodes, settings, fullscreen). There is no outer chrome — no header, no
// title row, no secondary episode list below the video. If the browser allows
// it we also enter true fullscreen and rotate to landscape on open (both are
// best-effort: they need a fresh user gesture and the player mounts after the
// async stream resolve, so failures are silent and harmless).
export function PlayerModal({
  item,
  stream,
  episodes,
  activeEpisode,
  loading,
  errorMessage,
  audioLanguages,
  audioLanguage,
  onSelectLanguage,
  hubQualities,
  hubQuality,
  onSelectQuality,
  defaultPlaybackRate,
  autoAdvance,
  provider,
  onClose,
  onSelectEpisode,
  onSourcesExhausted,
}: Props) {
  const progress = useProgress(provider);
  const { rate, setRate } = usePlaybackRate(defaultPlaybackRate);

  const [stalledMessage, setStalledMessage] = useState<string | null>(null);

  const resolved = resolveStream(stream);
  const sources = resolved.kind === 'sources' ? resolved.sources : [];
  const [sourceIndex, setSourceIndex] = useState(0);
  const source = sources[sourceIndex]?.link;
  const sourceHeaders = sources[sourceIndex]?.headers;

  // External caption tracks ride along on the active source's `subtitles`
  // field. resolveStream drops them (they're not playable sources), so pull
  // them off the raw payload and hand them to PlayerStage for registration
  // as text tracks.
  const subtitles = useMemo<SubtitleTrack[]>(() => {
    if (!stream || !source) return [];
    const raw = stream.find((s) => (s.link ?? s.url) === source)?.subtitles;
    return subtitleTracksFrom(raw);
  }, [stream, source]);

  // A source that never sends bytes (dead CDN, redirect loop, download-only
  // links) fires no error event — the player would hang on its spinner
  // forever. If the current source hasn't reached loadedmetadata within the
  // window, treat it as dead and fall through to the next source — or hand
  // over to the hub/episode fallback when the stream's sources are done.
  const sourceLoadedRef = useRef(false);
  const advanceIfStalled = useCallback(() => {
    if (sourceLoadedRef.current) return;
    if (sourceIndex < sources.length - 1) {
      setSourceIndex((index) => index + 1);
      return;
    }
    onSourcesExhausted();
  }, [sourceIndex, sources.length, onSourcesExhausted]);

  // A new stream (new title, episode, or quality set) always starts on the
  // first source; otherwise an index left over from a longer list would
  // point past the end and the player would show "no stream".
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally re-runs when the stream changes even though the body only uses the stable setter.
  useEffect(() => {
    setSourceIndex(0);
    setStalledMessage(null);
  }, [stream]);

  const savedPosition = source ? progress.get(item.link, activeEpisode)?.position : undefined;

  // (Re)arm the stall timer whenever the source changes: the timer is cleared
  // as soon as the source loads its metadata.
  useEffect(() => {
    sourceLoadedRef.current = false;
    if (!source) return;
    const timer = window.setTimeout(advanceIfStalled, SOURCE_STALL_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [source, advanceIfStalled]);

  // Every source goes through the server-side stream proxy, which injects
  // the provider-required headers (Referer/Origin/Cookie) advertised on the
  // stream; Vidstack picks the HLS provider for m3u8 manifests and the
  // native video provider for MP4s/MKVs. Unsupported containers surface as
  // an error here and fall through to the next source.
  const playerSrc: PlayerSrc = source ? playbackUrl(source, sourceHeaders) : '';

  const handleEnded = useCallback(() => {
    progress.clear(item.link, activeEpisode);
  }, [item.link, activeEpisode, progress.clear]);

  useScrollLock();

  // --- Immersive open: best-effort fullscreen + landscape ------------------

  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    try {
      const anyFullscreen =
        document.fullscreenElement ||
        (document as Document & { webkitFullscreenElement?: Element | null })
          .webkitFullscreenElement;
      if (!anyFullscreen) {
        const req = (
          el as HTMLElement & {
            requestFullscreen?: () => Promise<void>;
            webkitRequestFullscreen?: () => void;
          }
        ).requestFullscreen?.();
        req?.catch?.(() => {});
      }
    } catch {
      // Fullscreen isn't available on this device — the immersive tab-fill
      // layout below is the experience anyway.
    }
    try {
      const orientation = screen as Screen & {
        orientation?: { lock?: (orientation: string) => Promise<void> };
      };
      orientation.orientation?.lock?.('landscape').catch(() => {});
    } catch {
      // iOS Safari and some browsers expose no orientation lock.
    }
  }, []);

  // Rotate hint: on portrait phones the 16:9 video letterboxes, so nudge the
  // viewer to rotate. Auto-dismisses; the in-player fullscreen button still
  // does the real rotation on supported browsers.
  const [isPortrait, setIsPortrait] = useState(false);
  const [showRotateHint, setShowRotateHint] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(orientation: portrait)');
    setIsPortrait(mq.matches);
    const onChange = (event: MediaQueryListEvent) => setIsPortrait(event.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (!isPortrait || !source) {
      setShowRotateHint(false);
      return;
    }
    setShowRotateHint(true);
    const timer = window.setTimeout(() => setShowRotateHint(false), 4000);
    return () => window.clearTimeout(timer);
  }, [isPortrait, source]);

  return (
    // AnimatePresence in App drives the enter/exit; transform/opacity only.
    // Fills the viewport on black — the video letterboxes via object-fit and
    // everything else (title, back, episodes, settings) lives in PlayerStage.
    <motion.div
      ref={rootRef}
      className="fixed inset-0 z-50 overflow-hidden bg-black"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={SPRING_SOFT}
    >
      <div className="relative h-full w-full">
        {source ? (
          <MediaPlayer
            src={playerSrc}
            title={titleFor(item)}
            poster={imageUrl(item.image)}
            playsInline
            className="h-full w-full"
            onError={() => {
              if (sourceIndex < sources.length - 1) {
                setStalledMessage(null);
                setSourceIndex((index) => index + 1);
                return;
              }
              // Every source of this stream is dead — hand over to the
              // hub/episode fallback instead of failing the playback.
              setStalledMessage(null);
              onSourcesExhausted();
            }}
            onLoadedMetadata={() => {
              sourceLoadedRef.current = true;
            }}
          >
            <MediaProvider />
            <PlayerStage
              source={source}
              savedPosition={savedPosition}
              rate={rate}
              setRate={setRate}
              autoAdvance={autoAdvance}
              stalledMessage={stalledMessage}
              item={item}
              episodes={episodes}
              activeEpisode={activeEpisode}
              audioLanguages={audioLanguages}
              audioLanguage={audioLanguage}
              onSelectLanguage={onSelectLanguage}
              hubQualities={hubQualities}
              hubQuality={hubQuality}
              onSelectQuality={onSelectQuality}
              subtitles={subtitles}
              onSelectEpisode={onSelectEpisode}
              onClose={onClose}
              onEnded={handleEnded}
              progress={progress}
            />
          </MediaPlayer>
        ) : (
          <div className="absolute inset-0 grid place-items-center bg-black px-6 text-center text-white/80">
            <div>
              {stalledMessage ? (
                <p className="text-base font-semibold text-white">{stalledMessage}</p>
              ) : (
                <p className="text-sm sm:text-base">
                  {errorMessage ??
                    (loading
                      ? 'Finding the best stream...'
                      : 'No playable stream was returned for this title.')}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Portrait nudge: rotate the phone for the letterboxed view to fill
            the screen. Purely advisory and auto-dismissing. */}
        <AnimatePresence>
          {showRotateHint && source && (
            <motion.div
              className="pointer-events-none absolute inset-x-0 bottom-6 z-30 flex justify-center px-4"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ duration: 0.2 }}
            >
              <div className="flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-2 text-xs font-medium text-white/85 backdrop-blur">
                <RotateCw className="size-3.5" />
                Rotate your phone for landscape viewing
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
