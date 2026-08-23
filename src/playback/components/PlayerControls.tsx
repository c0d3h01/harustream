'use client';

import { useMediaContext, useMediaRemote, useMediaState } from '@vidstack/react';
import { ArrowLeft, Captions, Maximize, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Episode, Media, StreamSource } from '@/types';
import { shouldOfferResume } from '../resume';

type Props = {
  item: Media;
  episodeRef: string;
  episodeTitle?: string;
  episodes: Episode[];
  source: StreamSource;
  sources: StreamSource[];
  subtitleId: string;
  progress: {
    get: (ref: string, episodeRef?: string) => { position: number; duration: number } | undefined;
    save: (
      ref: string,
      episodeRef: string,
      position: number,
      duration: number,
      meta?: {
        title?: string;
        poster?: string;
        type?: string;
        episodeTitle?: string;
        provider?: string;
      },
    ) => void;
    clear: (ref: string, episodeRef: string) => void;
  };
  onBack: () => void;
  onSource: (sourceId: string) => void;
  onSubtitle: (subtitleId: string) => void;
  onEpisode: (episode: Episode) => void;
};

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

export function PlayerControls({
  item,
  episodeRef,
  episodeTitle,
  episodes,
  source,
  sources,
  subtitleId,
  progress,
  onBack,
  onSource,
  onSubtitle,
  onEpisode,
}: Props) {
  const { textTracks } = useMediaContext();
  const remote = useMediaRemote();
  const paused = useMediaState('paused');
  const currentTime = useMediaState('currentTime');
  const duration = useMediaState('duration');
  const playing = useMediaState('playing');
  const [resumeVisible, setResumeVisible] = useState(false);
  const saved = progress.get(item.ref, episodeRef);
  const playbackRef = useRef({ currentTime, duration });

  useEffect(() => {
    setResumeVisible(shouldOfferResume(saved?.position, saved?.duration));
  }, [saved?.duration, saved?.position]);

  useEffect(() => {
    playbackRef.current = { currentTime, duration };
  }, [currentTime, duration]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      const { currentTime: position, duration: length } = playbackRef.current;
      if (length > 0) {
        progress.save(item.ref, episodeRef, position, length, {
          title: item.displayTitle,
          poster: item.posterUrl,
          type: item.kind,
          episodeTitle,
          provider: item.providerId,
        });
      }
    }, 4000);
    return () => window.clearInterval(timer);
  }, [episodeRef, episodeTitle, item, playing, progress.save]);

  useEffect(() => {
    if (!paused || currentTime <= 0 || duration <= 0) return;
    progress.save(item.ref, episodeRef, currentTime, duration, {
      title: item.displayTitle,
      poster: item.posterUrl,
      type: item.kind,
      episodeTitle,
      provider: item.providerId,
    });
  }, [currentTime, duration, episodeRef, episodeTitle, item, paused, progress.save]);

  useEffect(() => {
    for (const track of textTracks) {
      track.mode = track.id === subtitleId ? 'showing' : 'disabled';
    }
  }, [subtitleId, textTracks]);

  const togglePlayback = useCallback(() => {
    remote.togglePaused();
    setResumeVisible(false);
  }, [remote]);

  const selectSubtitle = useCallback(
    (id: string) => {
      onSubtitle(id);
    },
    [onSubtitle],
  );

  const toggleFullscreen = useCallback(() => {
    remote.toggleFullscreen();
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (value: string) => Promise<void>;
    };
    orientation.lock?.('landscape').catch(() => {});
  }, [remote]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, select, textarea')) return;
      if (event.key === ' ' || event.key.toLowerCase() === 'k') {
        event.preventDefault();
        togglePlayback();
      } else if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'j') {
        event.preventDefault();
        remote.seek(Math.max(0, currentTime - 10));
      } else if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'l') {
        event.preventDefault();
        remote.seek(Math.min(duration, currentTime + 10));
      } else if (event.key.toLowerCase() === 'm') {
        remote.toggleMuted();
      } else if (event.key.toLowerCase() === 'f') {
        toggleFullscreen();
      } else if (event.key === 'Escape') {
        onBack();
      }
    },
    [currentTime, duration, onBack, remote, toggleFullscreen, togglePlayback],
  );

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onKeyDown]);

  return (
    <div
      className="absolute inset-0 z-10 flex flex-col justify-between bg-gradient-to-b from-black/70 via-transparent to-black/80 p-4 text-white sm:p-8"
      role="application"
      aria-label={`Video player for ${item.displayTitle}`}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          aria-label="Back to title"
          onClick={onBack}
          className="touch-target rounded-full p-2 hover:bg-white/15"
        >
          <ArrowLeft className="size-5" />
        </button>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{item.displayTitle}</p>
          {episodeTitle ? <p className="text-xs text-white/70">{episodeTitle}</p> : null}
        </div>
      </div>

      {resumeVisible ? (
        <div className="self-center rounded-2xl bg-black/70 p-5 text-center backdrop-blur">
          <p className="text-sm">Resume from {formatTime(saved?.position ?? 0)}?</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold"
              onClick={() => {
                remote.seek(saved?.position ?? 0);
                remote.play();
                setResumeVisible(false);
              }}
            >
              Resume
            </button>
            <button
              type="button"
              className="rounded-lg bg-white/15 px-4 py-2 text-sm"
              onClick={() => {
                remote.seek(0);
                remote.play();
                setResumeVisible(false);
              }}
            >
              Start over
            </button>
          </div>
        </div>
      ) : null}

      <div>
        <input
          aria-label="Seek"
          type="range"
          min={0}
          max={duration || 0}
          step={1}
          value={Math.min(currentTime, duration || 0)}
          onChange={(event) => remote.seek(Number(event.target.value))}
          className="w-full accent-[var(--primary)]"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-label={paused ? 'Play' : 'Pause'}
            onClick={togglePlayback}
            className="touch-target rounded-full p-2 hover:bg-white/15"
          >
            {paused ? <Play className="size-5 fill-current" /> : <Pause className="size-5" />}
          </button>
          <button
            type="button"
            aria-label="Seek back 10 seconds"
            onClick={() => remote.seek(Math.max(0, currentTime - 10))}
            className="touch-target rounded-full p-2 hover:bg-white/15"
          >
            <SkipBack className="size-5" />
          </button>
          <button
            type="button"
            aria-label="Seek forward 10 seconds"
            onClick={() => remote.seek(Math.min(duration, currentTime + 10))}
            className="touch-target rounded-full p-2 hover:bg-white/15"
          >
            <SkipForward className="size-5" />
          </button>
          <span className="text-xs tabular-nums text-white/70">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
          <label className="ml-auto flex items-center gap-2 text-xs">
            <Captions className="size-4" aria-hidden="true" />
            <select
              aria-label="Source"
              value={source.id}
              onChange={(event) => onSource(event.target.value)}
              className="max-w-32 rounded bg-black/60 px-2 py-1"
            >
              {sources.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
          {source.subtitles.length ? (
            <select
              aria-label="Subtitles"
              value={subtitleId}
              onChange={(event) => selectSubtitle(event.target.value)}
              className="max-w-32 rounded bg-black/60 px-2 py-1 text-xs"
            >
              <option value="">Subtitles off</option>
              {source.subtitles.map((subtitle) => (
                <option key={subtitle.id} value={subtitle.id}>
                  {subtitle.label}
                </option>
              ))}
            </select>
          ) : null}
          {episodes.length > 1 ? (
            <select
              aria-label="Episode"
              value={episodeRef}
              onChange={(event) => {
                const next = episodes.find((episode) => episode.ref === event.target.value);
                if (next) onEpisode(next);
              }}
              className="max-w-36 rounded bg-black/60 px-2 py-1 text-xs"
            >
              {episodes.map((episode) => (
                <option key={episode.id} value={episode.ref}>
                  {episode.title}
                </option>
              ))}
            </select>
          ) : null}
          <button
            type="button"
            aria-label="Fullscreen"
            onClick={toggleFullscreen}
            className="touch-target rounded-full p-2 hover:bg-white/15"
          >
            <Maximize className="size-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
