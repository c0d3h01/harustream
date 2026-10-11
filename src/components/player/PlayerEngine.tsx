'use client';

import { ArrowLeft, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { StreamVariant } from '@/lib/streaming/types';
import type { Episode, Media } from '@/types/media';
import { Controls } from './Controls';
import { PlayerError } from './PlayerError';
import { usePlayerEngine } from './usePlayerEngine';

export interface PlayerEngineProps {
  item: Media;
  activeEpisode: Episode;
  variant: StreamVariant;
  allVariantsCount: number;
  hasPrevEpisode: boolean;
  hasNextEpisode: boolean;
  progress: {
    get: (ref: string, episodeRef?: string) => { position: number; duration: number } | undefined;
    save: (ref: string, episodeRef: string, position: number, duration: number) => void;
  };
  onVariantFailed: (variantId: string) => void;
  onEnded: () => void;
  onPrevEpisode: () => void;
  onNextEpisode: () => void;
  onToggleEpisodes: () => void;
  onToggleSources: () => void;
  episodesOpen: boolean;
  sourcesOpen: boolean;
  onRetry: () => void;
  onClose?: () => void;
}

const STALL_HINT_MS = 8000;
const PROGRESS_SAVE_INTERVAL_MS = 5000;

export function PlayerEngine({
  item,
  activeEpisode,
  variant,
  allVariantsCount,
  hasPrevEpisode,
  hasNextEpisode,
  progress,
  onVariantFailed,
  onEnded,
  onPrevEpisode,
  onNextEpisode,
  onToggleEpisodes,
  onToggleSources,
  episodesOpen,
  sourcesOpen,
  onRetry,
  onClose,
}: PlayerEngineProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const resumedRef = useRef(false);
  const endedRef = useRef(false);
  const lastSaveRef = useRef(0);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const state = usePlayerEngine(videoEl, variant);
  const [stalledTooLong, setStalledTooLong] = useState(false);
  const [now, setNow] = useState(0);

  // Sync ref → state so usePlayerEngine re-runs when the element mounts.
  useEffect(() => {
    setVideoEl(videoRef.current);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: variant is intentionally trigger-only
  useEffect(() => {
    resumedRef.current = false;
    endedRef.current = false;
    setStalledTooLong(false);
  }, [variant]);

  useEffect(() => {
    if (state.status === 'error') onVariantFailed(variant.variantId);
  }, [state.status, variant.variantId, onVariantFailed]);

  useEffect(() => {
    if (state.status !== 'stalled') {
      setStalledTooLong(false);
      return;
    }
    const timer = window.setTimeout(() => setStalledTooLong(true), STALL_HINT_MS);
    return () => window.clearTimeout(timer);
  }, [state.status]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onLoadedMetadata = () => {
      if (resumedRef.current) return;
      resumedRef.current = true;
      const saved = progress.get(item.ref, activeEpisode.ref);
      const duration = Number.isFinite(video.duration) ? video.duration : undefined;
      if (saved && saved.position > 5 && duration !== undefined && duration - saved.position > 10) {
        video.currentTime = Math.min(saved.position, duration - 10);
      }
    };
    const onTimeUpdate = () => {
      setNow(video.currentTime);
      const nowMs = Date.now();
      if (nowMs - lastSaveRef.current < PROGRESS_SAVE_INTERVAL_MS) return;
      lastSaveRef.current = nowMs;
      if (Number.isFinite(video.duration)) {
        progress.save(item.ref, activeEpisode.ref, video.currentTime, video.duration);
      }
    };
    const onEndedEvent = () => {
      if (endedRef.current) return;
      endedRef.current = true;
      onEnded();
    };
    const onSeeked = () => {
      endedRef.current = false;
    };

    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('ended', onEndedEvent);
    video.addEventListener('seeked', onSeeked);
    return () => {
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('ended', onEndedEvent);
      video.removeEventListener('seeked', onSeeked);
    };
  }, [item.ref, activeEpisode.ref, progress, onEnded]);

  const activeSkip = variant.skip?.find((entry) => now >= entry.from && now < entry.to);

  return (
    <div
      ref={viewportRef}
      className="player-viewport cinema-player fixed inset-0 z-50 h-[100dvh] w-full bg-black"
    >
      {/* biome-ignore lint/a11y/useMediaCaption: tracks are rendered per-variant below when the provider supplies subtitles. */}
      <video
        ref={videoRef}
        className="h-full w-full object-contain"
        playsInline
        autoPlay
        crossOrigin="anonymous"
        aria-label={`Video player for ${item.displayTitle}`}
      >
        {variant.subtitles.map((subtitle) => (
          <track
            key={subtitle.id}
            src={subtitle.href}
            kind="subtitles"
            label={subtitle.label}
            srcLang={subtitle.language}
            default={
              subtitle.language.startsWith('en') || subtitle.label.toLowerCase().includes('english')
            }
          />
        ))}
      </video>

      {state.status === 'loading' || state.status === 'buffering' || state.status === 'stalled' ? (
        <div
          className="pointer-events-none absolute inset-0 grid place-items-center"
          aria-hidden="true"
        >
          <Loader2 className="size-10 animate-spin text-white/70" />
        </div>
      ) : null}

      {stalledTooLong ? (
        <div className="absolute inset-x-0 bottom-24 z-scrubber flex justify-center px-4">
          <button
            type="button"
            onClick={onToggleSources}
            className="video-chrome rounded-full px-4 py-2 text-xs font-semibold text-white transition-transform active:scale-95"
          >
            {'Still stuck? Switch source'}
          </button>
        </div>
      ) : null}

      {activeSkip ? (
        <div className="absolute inset-x-0 bottom-24 z-scrubber flex justify-end px-4">
          <button
            type="button"
            onClick={() => {
              const video = videoRef.current;
              if (video) video.currentTime = activeSkip.to;
            }}
            className="video-chrome rounded-full px-4 py-2 text-xs font-semibold text-white transition-transform active:scale-95"
          >
            {activeSkip.title || 'Skip intro'}
          </button>
        </div>
      ) : null}

      {state.status === 'error' && state.error ? (
        <PlayerError
          error={state.error}
          hasOtherSources={allVariantsCount > 1}
          onRetry={onRetry}
          onOpenSources={onToggleSources}
          onClose={onClose}
          downloadHref={variant.playbackHref}
        />
      ) : null}

      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          className="video-chrome absolute left-4 top-[max(1rem,env(safe-area-inset-top))] z-chrome rounded-lg p-2.5 text-white/80 transition-colors hover:text-white"
          aria-label={'Go back'}
        >
          <ArrowLeft size={18} />
        </button>
      ) : null}

      <Controls
        videoRef={videoRef}
        viewportRef={viewportRef}
        status={state.status}
        hasPrevEpisode={hasPrevEpisode}
        hasNextEpisode={hasNextEpisode}
        onPrevEpisode={onPrevEpisode}
        onNextEpisode={onNextEpisode}
        showEpisodesButton={hasPrevEpisode || hasNextEpisode}
        showSourcesButton={allVariantsCount > 1}
        onToggleEpisodes={onToggleEpisodes}
        onToggleSources={onToggleSources}
        episodesOpen={episodesOpen}
        sourcesOpen={sourcesOpen}
      />
    </div>
  );
}
