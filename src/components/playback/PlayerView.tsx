'use client';

import {
  isDASHProvider,
  isHLSProvider,
  MediaPlayer,
  type MediaPlayerInstance,
  MediaProvider,
  type MediaProviderAdapter,
  type MediaProviderChangeEvent,
  type PlayerSrc,
  Poster,
  Track,
  useMediaState,
} from '@vidstack/react';

import { DefaultVideoLayout, defaultLayoutIcons } from '@vidstack/react/player/layouts/default';
import { ArrowLeft, ChevronLeft, ChevronRight, Layers, Server, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EASE, SPRING_SOFT } from '@/components/motion/transitions';
import { playbackUrl, playerSrc } from '@/lib/media/playbackHref';
import type { Episode, Media, StreamSource } from '@/types';
import { mediaPlaybackUrl } from './proxy';

type Props = {
  item: Media;
  activeEpisode?: Episode;
  source?: StreamSource;
  episodes: Episode[];
  allSources: readonly StreamSource[];
  progress: {
    get: (ref: string, episodeRef?: string) => { position: number; duration: number } | undefined;
  };
  onSourceFailure: () => void;
  onEnded: () => void;
  onSelectEpisode: (episode: Episode) => void;
  onSelectSource: (sourceId: string) => void;
  onClose?: () => void;
};

// ---------------------------------------------------------------------------
// Overlay panel identifiers
// ---------------------------------------------------------------------------
type Panel = 'episodes' | 'servers' | null;

export function PlayerView({
  item,
  activeEpisode,
  source,
  episodes,
  allSources,
  progress,
  onSourceFailure,
  onEnded,
  onSelectEpisode,
  onSelectSource,
  onClose,
}: Props) {
  const player = useRef<MediaPlayerInstance>(null);
  const resumedRef = useRef(false);
  const endedRef = useRef(false);

  // Reset flags when source changes
  useEffect(() => {
    if (!source) return;
    resumedRef.current = false;
    endedRef.current = false;
  }, [source]);

  const src = useMemo<PlayerSrc | null>(() => {
    if (!source || !activeEpisode) return null;
    const sourceUrl =
      source.playbackHref ??
      mediaPlaybackUrl(source, {
        providerId: item.providerId,
        ref: activeEpisode.ref,
        kind: item.kind,
      });
    return sourceUrl ? playerSrc(sourceUrl, source.format) : null;
  }, [source, activeEpisode, item]);

  const tracks = useMemo(
    () =>
      source?.subtitles.map((subtitle) => ({
        src: subtitle.href ?? playbackUrl(subtitle.url, source.headers, subtitle.format),
        kind: 'subtitles' as const,
        label: subtitle.label,
        language: subtitle.language,
        id: subtitle.id,
        type: subtitle.format === 'ttml' ? undefined : subtitle.format,
        default:
          subtitle.language.startsWith('en') || subtitle.label.toLowerCase().includes('english'),
      })) ?? [],
    [source],
  );

  // Close panel on Escape handled in PlayerOverlay

  if (!source || !activeEpisode || !src) return null;

  function onProviderChange(
    provider: MediaProviderAdapter | null,
    _nativeEvent: MediaProviderChangeEvent,
  ) {
    if (isHLSProvider(provider)) {
      provider.library = () => import('hls.js');
      provider.config = {};
    } else if (isDASHProvider(provider)) {
      provider.library = async () => {
        const mod = await import('dashjs');
        const dash = ((mod as { default?: unknown }).default ?? mod) as typeof mod;
        return { default: dash };
      };
      provider.config = {};
    }
  }

  function onCanPlay() {
    if (resumedRef.current) return;
    resumedRef.current = true;

    const media = player.current?.el?.querySelector('video');
    const duration = media && Number.isFinite(media.duration) ? media.duration : undefined;
    const saved = progress.get(item.ref, activeEpisode!.ref);
    const position =
      saved?.position !== undefined && saved.position > 5 && duration !== undefined
        ? Math.min(saved.position, Math.max(0, duration - 10))
        : undefined;
    if (position !== undefined && media) media.currentTime = position;
  }

  return (
    <>
      <MediaPlayer
        ref={player}
        className="player-viewport cinema-player fixed inset-0 z-50 h-[100dvh] w-full bg-black"
        src={src}
        viewType="video"
        streamType="on-demand"
        logLevel="warn"
        crossOrigin
        playsInline
        title={item.displayTitle}
        poster={item.posterUrl ?? ''}
        onProviderChange={onProviderChange}
        onCanPlay={onCanPlay}
        onEnded={() => {
          if (endedRef.current) return;
          endedRef.current = true;
          onEnded();
        }}
        onError={() => onSourceFailure()}
      >
        <MediaProvider>
          <Poster className="vds-poster" />
          {tracks.map((track) => (
            <Track key={track.id} {...track} />
          ))}
        </MediaProvider>
        <DefaultVideoLayout icons={defaultLayoutIcons} />

        <PlayerOverlay
          episodes={episodes}
          activeEpisode={activeEpisode}
          allSources={allSources}
          source={source}
          onSelectEpisode={onSelectEpisode}
          onSelectSource={onSelectSource}
          onClose={onClose}
        />
      </MediaPlayer>
    </>
  );
}

// ---------------------------------------------------------------------------
// Player Overlay
// ---------------------------------------------------------------------------
function PlayerOverlay({
  episodes,
  activeEpisode,
  allSources,
  source,
  onSelectEpisode,
  onSelectSource,
  onClose,
}: {
  episodes: Episode[];
  activeEpisode: Episode;
  allSources: readonly StreamSource[];
  source: StreamSource;
  onSelectEpisode: (ep: Episode) => void;
  onSelectSource: (src: string) => void;
  onClose?: () => void;
}) {
  const [openPanel, setOpenPanel] = useState<Panel>(null);
  const isControlsVisible = useMediaState('controlsVisible');

  const episodeIndex = useMemo(
    () => episodes.findIndex((ep) => ep.id === activeEpisode.id),
    [activeEpisode, episodes],
  );
  const hasPrev = episodeIndex > 0;
  const hasNext = episodeIndex >= 0 && episodeIndex < episodes.length - 1;
  const goPrev = useCallback(() => {
    if (hasPrev) onSelectEpisode(episodes[episodeIndex - 1]);
  }, [hasPrev, episodes, episodeIndex, onSelectEpisode]);
  const goNext = useCallback(() => {
    if (hasNext) onSelectEpisode(episodes[episodeIndex + 1]);
  }, [hasNext, episodes, episodeIndex, onSelectEpisode]);

  useEffect(() => {
    if (!openPanel) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenPanel(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [openPanel]);

  return (
    <>
      {/* ── Player overlay controls ── */}
      <div
        className="absolute inset-x-0 top-0 z-[100] pointer-events-none transition-opacity duration-300"
        style={{ opacity: isControlsVisible || openPanel ? 1 : 0 }}
      >
        {/* Top bar: episode nav + panel toggles */}
        <div className="pointer-events-auto flex items-center gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-2">
          {/* Back Button */}
          {onClose && (
            <motion.button
              type="button"
              onClick={onClose}
              className="rounded-xl p-2.5 backdrop-blur-md bg-black/60 border border-white/10 text-white/80 hover:bg-white/10 hover:text-white transition-colors shadow-lg"
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: EASE }}
              aria-label="Go back"
            >
              <ArrowLeft size={18} />
            </motion.button>
          )}

          {/* Episode navigation */}
          {episodes.length > 1 && (
            <motion.div
              className="flex items-center gap-1 rounded-xl bg-black/60 backdrop-blur-md px-1.5 py-1 border border-white/10 shadow-lg"
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: EASE }}
            >
              <button
                type="button"
                disabled={!hasPrev}
                onClick={goPrev}
                className="rounded-lg p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:pointer-events-none"
                aria-label="Previous episode"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="px-2 text-xs font-medium text-white/90 select-none tabular-nums min-w-[5ch] text-center">
                {episodeIndex + 1}/{episodes.length}
              </span>
              <button
                type="button"
                disabled={!hasNext}
                onClick={goNext}
                className="rounded-lg p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:pointer-events-none"
                aria-label="Next episode"
              >
                <ChevronRight size={18} />
              </button>
            </motion.div>
          )}

          {/* Panel toggles */}
          <motion.div
            className="flex items-center gap-1.5 ml-auto shadow-lg"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: EASE, delay: 0.05 }}
          >
            {episodes.length > 1 && (
              <button
                type="button"
                onClick={() => setOpenPanel(openPanel === 'episodes' ? null : 'episodes')}
                className={`rounded-xl p-2.5 backdrop-blur-md border transition-colors ${
                  openPanel === 'episodes'
                    ? 'bg-white/20 border-white/20 text-white'
                    : 'bg-black/60 border-white/10 text-white/70 hover:bg-white/10 hover:text-white'
                }`}
                aria-label="Episode list"
                aria-expanded={openPanel === 'episodes'}
              >
                <Layers size={18} />
              </button>
            )}
            {allSources.length > 1 && (
              <button
                type="button"
                onClick={() => setOpenPanel(openPanel === 'servers' ? null : 'servers')}
                className={`rounded-xl p-2.5 backdrop-blur-md border transition-colors ${
                  openPanel === 'servers'
                    ? 'bg-white/20 border-white/20 text-white'
                    : 'bg-black/60 border-white/10 text-white/70 hover:bg-white/10 hover:text-white'
                }`}
                aria-label="Server list"
                aria-expanded={openPanel === 'servers'}
              >
                <Server size={18} />
              </button>
            )}
          </motion.div>
        </div>
      </div>

      {/* ── Slide-in panels ── */}
      <AnimatePresence>
        {openPanel === 'episodes' && (
          <EpisodePanel
            episodes={episodes}
            activeId={activeEpisode.id}
            onSelect={(ep) => {
              onSelectEpisode(ep);
              setOpenPanel(null);
            }}
            onClose={() => setOpenPanel(null)}
          />
        )}
        {openPanel === 'servers' && (
          <ServerPanel
            sources={allSources}
            activeId={source.id}
            onSelect={(id) => {
              onSelectSource(id);
              setOpenPanel(null);
            }}
            onClose={() => setOpenPanel(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

// ---------------------------------------------------------------------------
// Episode panel
// ---------------------------------------------------------------------------
function EpisodePanel({
  episodes,
  activeId,
  onSelect,
  onClose,
}: {
  episodes: Episode[];
  activeId: string;
  onSelect: (ep: Episode) => void;
  onClose: () => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  // Scroll the active episode into view on mount
  useEffect(() => {
    const el = listRef.current?.querySelector('[data-active="true"]');
    el?.scrollIntoView({ block: 'center', behavior: 'instant' });
  }, []);

  return (
    <motion.div
      className="absolute inset-y-0 right-0 z-[70] w-[min(22rem,85vw)] flex flex-col bg-black/80 backdrop-blur-xl border-l border-white/10"
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={SPRING_SOFT}
    >
      <div className="flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3 border-b border-white/10">
        <h2 className="text-sm font-semibold text-white tracking-wide">Episodes</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white transition-colors"
          aria-label="Close episode list"
        >
          <X size={18} />
        </button>
      </div>
      <div ref={listRef} className="flex-1 overflow-y-auto overscroll-contain scrollbar-thin py-1">
        {episodes.map((ep, i) => {
          const isActive = ep.id === activeId;
          return (
            <motion.button
              key={ep.id}
              type="button"
              data-active={isActive}
              onClick={() => onSelect(ep)}
              className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors ${
                isActive
                  ? 'bg-white/12 text-white'
                  : 'text-white/70 hover:bg-white/8 hover:text-white'
              }`}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2, delay: Math.min(i * 0.03, 0.3), ease: EASE }}
            >
              <span
                className={`flex-none w-7 h-7 rounded-lg text-xs font-bold flex items-center justify-center ${
                  isActive ? 'bg-white text-black' : 'bg-white/10 text-white/60'
                }`}
              >
                {i + 1}
              </span>
              <span className="truncate text-sm font-medium">{ep.title}</span>
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Server panel
// ---------------------------------------------------------------------------
function ServerPanel({
  sources,
  activeId,
  onSelect,
  onClose,
}: {
  sources: readonly StreamSource[];
  activeId: string;
  onSelect: (sourceId: string) => void;
  onClose: () => void;
}) {
  return (
    <motion.div
      className="fixed inset-y-0 right-0 z-[70] w-[min(22rem,85vw)] flex flex-col bg-black/80 backdrop-blur-xl border-l border-white/10"
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={SPRING_SOFT}
    >
      <div className="flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3 border-b border-white/10">
        <h2 className="text-sm font-semibold text-white tracking-wide">Servers</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white transition-colors"
          aria-label="Close server list"
        >
          <X size={18} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain scrollbar-thin py-1">
        {sources.map((src, i) => {
          const isActive = src.id === activeId;
          return (
            <motion.button
              key={src.id}
              type="button"
              onClick={() => onSelect(src.id)}
              className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors ${
                isActive
                  ? 'bg-white/12 text-white'
                  : 'text-white/70 hover:bg-white/8 hover:text-white'
              }`}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2, delay: Math.min(i * 0.03, 0.3), ease: EASE }}
            >
              <span
                className={`flex-none w-8 h-8 rounded-lg flex items-center justify-center ${
                  isActive ? 'bg-white/20 text-white' : 'bg-white/8 text-white/50'
                }`}
              >
                <Server size={14} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{src.label}</div>
                <div className="text-xs text-white/40 mt-0.5 flex items-center gap-1.5">
                  {src.quality && <span>{src.quality}</span>}
                  {src.quality && src.format && <span>·</span>}
                  {src.format && <span className="uppercase">{src.format}</span>}
                </div>
              </div>
              {isActive && (
                <motion.div
                  className="w-2 h-2 rounded-full bg-emerald-400 flex-none"
                  layoutId="active-server-dot"
                  transition={SPRING_SOFT}
                />
              )}
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
}
