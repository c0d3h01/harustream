'use client';

import { ArrowLeft, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useT } from '@/lib/i18n';
import type { Episode, Media, StreamVariant } from '@/types';
import { Controls } from './Controls';
import { PlayerError } from './PlayerError';
import type { PlayerErrorInfo } from './types';
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
  onVariantFailed: (variantId: string, error: PlayerErrorInfo) => void;
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
  const t = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const resumedRef = useRef(false);
  const endedRef = useRef(false);
  const lastSaveRef = useRef(0);
  const state = usePlayerEngine(videoRef, variant);
  const [stalledTooLong, setStalledTooLong] = useState(false);

  // Reset per-variant one-shot guards whenever the variant identity changes.
  // `variant` is a trigger-only dependency — the effect body doesn't read it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: variant is intentionally trigger-only
  useEffect(() => {
    resumedRef.current = false;
    endedRef.current = false;
    setStalledTooLong(false);
  }, [variant]);

  useEffect(() => {
    if (state.status === 'error' && state.error) onVariantFailed(variant.variantId, state.error);
  }, [state, variant.variantId, onVariantFailed]);

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
      const now = Date.now();
      if (now - lastSaveRef.current < PROGRESS_SAVE_INTERVAL_MS) return;
      lastSaveRef.current = now;
      if (Number.isFinite(video.duration)) {
        progress.save(item.ref, activeEpisode.ref, video.currentTime, video.duration);
      }
    };
    const onEndedEvent = () => {
      if (endedRef.current) return;
      endedRef.current = true;
      onEnded();
    };

    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('ended', onEndedEvent);
    return () => {
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('ended', onEndedEvent);
    };
  }, [item.ref, activeEpisode.ref, progress, onEnded]);

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
        aria-label={t('title.playerAria', { title: item.displayTitle })}
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
        <div className="absolute inset-x-0 bottom-24 z-[95] flex justify-center px-4">
          <button
            type="button"
            onClick={onToggleSources}
            className="glass-overlay rounded-full px-4 py-2 text-xs font-semibold text-white transition-transform active:scale-95"
          >
            {t('player.stalledHint')}
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
        />
      ) : null}

      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          className="glass-overlay glass-interactive absolute left-4 top-[max(1rem,env(safe-area-inset-top))] z-[100] rounded-xl p-2.5 text-white/80 shadow-lg transition-colors hover:text-white"
          aria-label="Go back"
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
