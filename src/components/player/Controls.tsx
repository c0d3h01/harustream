'use client';

// Playback controls bar. Reads/writes the `<video>` element directly via
// its ref — this is the one place in the player tree that touches the
// element's imperative API (currentTime, volume, textTracks, fullscreen);
// everything else reacts to `PlayerStatus` from `usePlayerEngine`.
import {
  Captions,
  ChevronLeft,
  ChevronRight,
  Layers,
  Maximize,
  Minimize,
  Pause,
  Play,
  Server,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/lib/i18n';
import type { PlayerStatus } from './types';

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
  const ss = String(secs).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

function useVideoTime(videoRef: React.RefObject<HTMLVideoElement | null>) {
  const [time, setTime] = useState({ current: 0, duration: 0, buffered: 0 });
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const update = () => {
      const buffered =
        video.buffered.length > 0 ? video.buffered.end(video.buffered.length - 1) : 0;
      setTime({ current: video.currentTime, duration: video.duration || 0, buffered });
    };
    video.addEventListener('timeupdate', update);
    video.addEventListener('durationchange', update);
    video.addEventListener('progress', update);
    update();
    return () => {
      video.removeEventListener('timeupdate', update);
      video.removeEventListener('durationchange', update);
      video.removeEventListener('progress', update);
    };
  }, [videoRef]);
  return time;
}

export interface ControlsProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** Fullscreen target — the whole player viewport, not just this bar. */
  viewportRef: React.RefObject<HTMLElement | null>;
  status: PlayerStatus;
  hasPrevEpisode: boolean;
  hasNextEpisode: boolean;
  onPrevEpisode: () => void;
  onNextEpisode: () => void;
  showEpisodesButton: boolean;
  showSourcesButton: boolean;
  onToggleEpisodes: () => void;
  onToggleSources: () => void;
  episodesOpen: boolean;
  sourcesOpen: boolean;
}

export function Controls({
  videoRef,
  viewportRef,
  status,
  hasPrevEpisode,
  hasNextEpisode,
  onPrevEpisode,
  onNextEpisode,
  showEpisodesButton,
  showSourcesButton,
  onToggleEpisodes,
  onToggleSources,
  episodesOpen,
  sourcesOpen,
}: ControlsProps) {
  const t = useT();
  const { current, duration, buffered } = useVideoTime(videoRef);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [captionsOn, setCaptionsOn] = useState(true);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const sync = () => {
      setMuted(video.muted);
      setVolume(video.volume);
    };
    video.addEventListener('volumechange', sync);
    sync();
    return () => video.removeEventListener('volumechange', sync);
  }, [videoRef]);

  useEffect(() => {
    const onFullscreenChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  }, [videoRef]);

  const seek = useCallback(
    (value: number) => {
      const video = videoRef.current;
      if (video) video.currentTime = value;
    },
    [videoRef],
  );

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (video) video.muted = !video.muted;
  }, [videoRef]);

  const changeVolume = useCallback(
    (value: number) => {
      const video = videoRef.current;
      if (!video) return;
      video.volume = value;
      video.muted = value === 0;
    },
    [videoRef],
  );

  const toggleFullscreen = useCallback(() => {
    const container = viewportRef.current;
    if (!container) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void container.requestFullscreen();
  }, [viewportRef]);

  const toggleCaptions = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const next = !captionsOn;
    setCaptionsOn(next);
    for (const track of Array.from(video.textTracks)) {
      track.mode = next && track.kind === 'subtitles' ? 'showing' : 'disabled';
    }
  }, [videoRef, captionsOn]);

  const isPlaying = status === 'playing';

  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="glass-overlay pointer-events-auto absolute inset-x-0 bottom-0 z-[90] flex flex-col gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6">
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={Math.min(current, duration || 0)}
          onChange={(event) => seek(Number(event.target.value))}
          aria-label={t('player.seek')}
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/20 accent-white"
          style={{
            backgroundImage: `linear-gradient(to right, white ${((current / (duration || 1)) * 100).toFixed(2)}%, rgba(255,255,255,0.35) ${((buffered / (duration || 1)) * 100).toFixed(2)}%, rgba(255,255,255,0.15) ${((buffered / (duration || 1)) * 100).toFixed(2)}%)`,
          }}
        />
        <div className="flex items-center gap-3 text-white">
          <button
            type="button"
            onClick={togglePlay}
            aria-label={isPlaying ? t('player.pause') : t('player.play')}
            className="rounded-full p-2 transition-colors hover:bg-white/10"
          >
            {isPlaying ? (
              <Pause size={20} className="fill-current" />
            ) : (
              <Play size={20} className="fill-current" />
            )}
          </button>

          {hasPrevEpisode ? (
            <button
              type="button"
              onClick={onPrevEpisode}
              aria-label={t('player.episodePicker')}
              className="rounded-full p-2 transition-colors hover:bg-white/10"
            >
              <ChevronLeft size={18} />
            </button>
          ) : null}
          {hasNextEpisode ? (
            <button
              type="button"
              onClick={onNextEpisode}
              aria-label={t('player.episodePicker')}
              className="rounded-full p-2 transition-colors hover:bg-white/10"
            >
              <ChevronRight size={18} />
            </button>
          ) : null}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleMute}
              aria-label={muted || volume === 0 ? t('player.play') : t('player.pause')}
              className="rounded-full p-2 transition-colors hover:bg-white/10"
            >
              {muted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={muted ? 0 : volume}
              onChange={(event) => changeVolume(Number(event.target.value))}
              aria-label="Volume"
              className="h-1 w-20 cursor-pointer appearance-none rounded-full bg-white/25 accent-white"
            />
          </div>

          <span className="tabular-nums text-xs font-medium text-white/80">
            {formatTime(current)} / {formatTime(duration)}
          </span>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={toggleCaptions}
              aria-pressed={captionsOn}
              aria-label={t('player.subtitlesPicker')}
              className={`rounded-full p-2 transition-colors hover:bg-white/10 ${captionsOn ? 'text-white' : 'text-white/50'}`}
            >
              <Captions size={18} />
            </button>
            {showEpisodesButton ? (
              <button
                type="button"
                onClick={onToggleEpisodes}
                aria-expanded={episodesOpen}
                aria-label={t('player.episodePicker')}
                className={`rounded-full p-2 transition-colors hover:bg-white/10 ${episodesOpen ? 'text-white' : 'text-white/70'}`}
              >
                <Layers size={18} />
              </button>
            ) : null}
            {showSourcesButton ? (
              <button
                type="button"
                onClick={onToggleSources}
                aria-expanded={sourcesOpen}
                aria-label={t('player.sourcePicker')}
                className={`rounded-full p-2 transition-colors hover:bg-white/10 ${sourcesOpen ? 'text-white' : 'text-white/70'}`}
              >
                <Server size={18} />
              </button>
            ) : null}
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={t('player.fullscreen')}
              className="rounded-full p-2 transition-colors hover:bg-white/10"
            >
              {fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
