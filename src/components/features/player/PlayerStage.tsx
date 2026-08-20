'use client';

// Custom Netflix-style controls + playback logic for the HLS/native player.
// Must be rendered as a child of <MediaPlayer> so the media context hooks
// resolve. Owns everything the DefaultVideoLayout used to: control bars,
// scrubber, quality/speed menus, keyboard shortcuts, resume prompt, next-
// episode countdown and the fail-loud overlay. HLS is handled by hls.js
// inside Vidstack's HLS provider; natively playable MP4s fall back to the
// browser's video element — no ffmpeg/transcode path exists anymore.

import {
  isHLSProvider,
  isVideoProvider,
  TextTrack,
  type TextTrackInit,
  useMediaPlayer,
  useMediaProvider,
  useMediaRemote,
  useMediaState,
} from '@vidstack/react';
import {
  ArrowLeft,
  Captions,
  ChevronLeft,
  ChevronRight,
  Gauge,
  Languages,
  ListVideo,
  LoaderCircle,
  Maximize,
  Minimize,
  Monitor,
  Pause,
  PictureInPicture,
  Play,
  RotateCcw,
  Settings,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Image from 'next/image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SPRING } from '@/components/motion/transitions';
import {
  type AudioLanguage,
  type Episode,
  type HubQuality,
  type Media,
  type SubtitleTrack,
  titleFor,
} from '@/lib/api/client';
import { PLAYBACK_RATES } from '@/lib/hooks/usePlaybackRate';
import type { useProgress } from '@/lib/hooks/useProgress';
import { imageUrl } from '@/lib/media/images';
import { cn } from '@/lib/utils';

type Props = {
  source: string;
  savedPosition?: number;
  rate: number;
  setRate: (rate: number) => void;
  autoAdvance: boolean;
  stalledMessage: string | null;
  item: Media;
  episodes: Episode[];
  activeEpisode: string;
  audioLanguages?: AudioLanguage[];
  audioLanguage?: string;
  onSelectLanguage?: (label: string) => void;
  /** Advertised resolutions (one linkList entry per 480p/720p/1080p hub), switched by re-resolving the stream. */
  hubQualities?: HubQuality[];
  hubQuality?: string;
  onSelectQuality?: (label: string) => void;
  /** External caption tracks (vtt/srt/ass URLs) advertised on the stream source. */
  subtitles?: SubtitleTrack[];
  onSelectEpisode: (episode: Episode) => void;
  onClose: () => void;
  onEnded: () => void;
  progress: ReturnType<typeof useProgress>;
};

const AUTO_HIDE_MS = 3000;
const NEXT_COUNTDOWN_S = 10;

// Cache one Intl.DisplayNames instance (constructed once per module) instead
// of building it per track — resolves BCP 47 codes like "en" → "English".
const LANGUAGE_NAMES =
  typeof Intl !== 'undefined' ? new Intl.DisplayNames(['en'], { type: 'language' }) : null;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function languageName(code: string): string {
  if (!code) return '';
  try {
    return LANGUAGE_NAMES?.of(code) ?? code;
  } catch {
    return code;
  }
}

function trackLabel(label: string, language: string, index: number): string {
  return label || languageName(language) || `Track ${index + 1}`;
}

// Audio menu rows are either app-level audio languages (one linkList entry
// per language, switched by re-resolving the stream) or tracks embedded in
// the current stream (switched via the remote control).
type AudioOption =
  | { kind: 'language'; label: string; selected: boolean; original: boolean }
  | { kind: 'track'; index: number; label: string; selected: boolean };

// Quality menu rows are app-level resolutions (one linkList entry per
// 480p/720p/1080p hub, switched by re-resolving the stream) or, when the
// stream is a multi-rendition HLS manifest with no linkList quality entries,
// the hls.js levels switched via the remote control (index -1 = Auto).
type QualityOption =
  | { kind: 'hub'; label: string; selected: boolean }
  | { kind: 'manifest'; index: number; label: string; selected: boolean };

export function PlayerStage({
  source,
  savedPosition,
  rate,
  setRate,
  autoAdvance,
  stalledMessage,
  item,
  episodes,
  activeEpisode,
  audioLanguages,
  audioLanguage,
  onSelectLanguage,
  hubQualities,
  hubQuality,
  onSelectQuality,
  subtitles = [],
  onSelectEpisode,
  onClose,
  onEnded,
  progress,
}: Props) {
  // --- Media context ------------------------------------------------------

  const providerInstance = useMediaProvider();
  const video = isVideoProvider(providerInstance)
    ? providerInstance.video
    : isHLSProvider(providerInstance)
      ? providerInstance.video
      : null;
  const remote = useMediaRemote();

  const paused = useMediaState('paused');
  const playing = useMediaState('playing');
  const waiting = useMediaState('waiting');
  const ended = useMediaState('ended');
  const currentTime = useMediaState('currentTime');
  const duration = useMediaState('duration');
  const bufferedEnd = useMediaState('bufferedEnd');
  const volume = useMediaState('volume');
  const muted = useMediaState('muted');
  const fullscreen = useMediaState('fullscreen');
  const canFullscreen = useMediaState('canFullscreen');
  const canPictureInPicture = useMediaState('canPictureInPicture');
  const qualities = useMediaState('qualities');
  const quality = useMediaState('quality');
  const audioTracks = useMediaState('audioTracks');
  const textTracks = useMediaState('textTracks');
  const mediaRate = useMediaState('playbackRate');

  // --- External subtitle registration -------------------------------------

  // External caption tracks ship per-source in the stream payload under
  // `subtitles` (vtt/srt/ass URLs outside the media container). They are not
  // part of the manifest, so they must be registered as text tracks manually —
  // otherwise the Subtitles menu and CC button stay hidden even though
  // captions are available. Tracks are scoped to the active source and torn
  // down on source change/unmount.
  const player = useMediaPlayer();
  const externalSubtitleRef = useRef<TextTrack[]>([]);

  useEffect(() => {
    if (!player) return;
    const tracks = player.textTracks;
    for (const subtitle of subtitles) {
      const init: TextTrackInit = {
        src: subtitle.src,
        kind: 'subtitles',
        label: subtitle.label || subtitle.language || 'Subtitles',
        language: subtitle.language,
        ...(subtitle.type ? { type: subtitle.type as TextTrackInit['type'] } : {}),
      };
      const track = new TextTrack(init);
      tracks.add(track);
      externalSubtitleRef.current.push(track);
    }
    return () => {
      for (const track of externalSubtitleRef.current) tracks.remove(track);
      externalSubtitleRef.current = [];
    };
  }, [player, subtitles]);

  // --- UI state -----------------------------------------------------------

  const [resumeOffered, setResumeOffered] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [menu, setMenu] = useState<'quality' | 'speed' | 'audio' | 'subtitles' | null>(null);
  const [episodesOpen, setEpisodesOpen] = useState(false);
  const [dragTime, setDragTime] = useState<number | null>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [nextOffer, setNextOffer] = useState<{ episode: Episode; remaining: number } | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const countdownRef = useRef<number | null>(null);
  const nextAdvanceRef = useRef(false);

  const title = titleFor(item);
  const episodeIndex = useMemo(
    () => episodes.findIndex((e) => e.link === activeEpisode || titleFor(e) === activeEpisode),
    [episodes, activeEpisode],
  );
  const activeEpisodeTitle = useMemo(
    () =>
      episodeIndex < 0 ? undefined : `E${episodeIndex + 1} · ${titleFor(episodes[episodeIndex])}`,
    [episodes, episodeIndex],
  );
  // Prev/next episode navigation lives in the transport cluster; the buttons
  // disable at the boundaries of the list (no wrap-around).
  const prevEpisode = episodeIndex > 0 ? episodes[episodeIndex - 1] : undefined;
  const nextEpisode =
    episodeIndex >= 0 && episodeIndex < episodes.length - 1
      ? episodes[episodeIndex + 1]
      : undefined;

  // --- Playback-rate persistence (mirror the element's rate into storage) --

  useEffect(() => {
    if (mediaRate !== rate && PLAYBACK_RATES.includes(mediaRate)) setRate(mediaRate);
  }, [mediaRate, rate, setRate]);

  // Re-apply the persisted rate when it changes or a new source loads;
  // HTMLMediaElement resets playbackRate on src change.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `source` is intentionally watched so the rate is re-applied when a new stream takes over.
  useEffect(() => {
    if (video && Number.isFinite(rate) && video.playbackRate !== rate) {
      video.playbackRate = rate;
    }
  }, [video, rate, source]);

  // --- Progress persistence ----------------------------------------------

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
          episodeTitle: episodes.length > 1 ? activeEpisodeTitle : undefined,
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
        episodeTitle: episodes.length > 1 ? activeEpisodeTitle : undefined,
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
  }, [
    video,
    item.link,
    activeEpisode,
    episodes.length,
    progress.save,
    progress.clear,
    activeEpisodeTitle,
  ]);

  // --- Source changes: reset transient state ------------------------------

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally re-runs when the stream changes.
  useEffect(() => {
    setResumeOffered(false);
    setDragTime(null);
    setMenu(null);
    setEpisodesOpen(false);
    if (countdownRef.current !== null) {
      window.clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setNextOffer(null);
  }, [source]);

  // Autoplay a stream we advanced to (next-episode countdown). The browser
  // blocks play() before the new source has loaded, so wait for metadata.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `source` is intentionally watched — the flag must be consumed once per new stream, and the element stays mounted across episode changes.
  useEffect(() => {
    if (!video || !nextAdvanceRef.current) return;
    const playWhenReady = () => {
      nextAdvanceRef.current = false;
      video.play().catch(() => {});
    };
    if (video.readyState >= 1) playWhenReady();
    else video.addEventListener('loadedmetadata', playWhenReady, { once: true });
  }, [video, source]);

  // --- Next-episode offer + countdown -------------------------------------

  const cancelCountdown = useCallback(() => {
    if (countdownRef.current !== null) {
      window.clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setNextOffer(null);
  }, []);

  const advanceTo = useCallback(
    (episode: Episode) => {
      cancelCountdown();
      nextAdvanceRef.current = true;
      onSelectEpisode(episode);
    },
    [cancelCountdown, onSelectEpisode],
  );

  useEffect(() => {
    if (!video) return;
    const onEndedEvent = () => {
      onEnded();
      const idx = episodes.findIndex((e) => e.link === activeEpisode);
      const next = episodes[idx + 1];
      if (!next || episodes.length < 2) return;
      if (autoAdvance) {
        setNextOffer({ episode: next, remaining: NEXT_COUNTDOWN_S });
        countdownRef.current = window.setInterval(() => {
          setNextOffer((offer) => {
            if (!offer) return null;
            if (offer.remaining <= 1) {
              advanceTo(offer.episode);
              return null;
            }
            return { ...offer, remaining: offer.remaining - 1 };
          });
        }, 1000);
      } else {
        setNextOffer({ episode: next, remaining: 0 });
      }
    };
    video.addEventListener('ended', onEndedEvent);
    return () => {
      video.removeEventListener('ended', onEndedEvent);
      if (countdownRef.current !== null) {
        window.clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    };
  }, [video, episodes, activeEpisode, autoAdvance, advanceTo, onEnded]);

  // --- Controls visibility / auto-hide ------------------------------------

  const bumpActivity = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (paused || !playing || menu || episodesOpen || nextOffer) return;
    hideTimerRef.current = window.setTimeout(() => setControlsVisible(false), AUTO_HIDE_MS);
    return () => {
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };
  }, [paused, playing, menu, episodesOpen, nextOffer]);

  // --- Resume / restart ----------------------------------------------------

  // Setting `currentTime` on a video with `readyState < 1` (HAVE_NOTHING)
  // throws `InvalidStateError` per HTMLMediaElement spec, so wait for
  // `loadedmetadata` if the user acts before the source has loaded.
  const offerResume = useCallback(() => {
    if (!video) return;
    setResumeOffered(true);
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
  }, [video, savedPosition]);

  const restart = useCallback(() => {
    if (!video) return;
    setResumeOffered(true);
    const seek = () => {
      video.currentTime = 0;
      video.play().catch(() => {});
    };
    if (video.readyState >= 1) seek();
    else video.addEventListener('loadedmetadata', seek, { once: true });
  }, [video]);

  const togglePlayback = useCallback(() => {
    setResumeOffered(true);
    remote.togglePaused();
  }, [remote]);

  const showResumePrompt =
    !!source &&
    !resumeOffered &&
    !stalledMessage &&
    typeof savedPosition === 'number' &&
    savedPosition >= 5;

  // --- Keyboard shortcuts --------------------------------------------------

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      // Let focused controls handle their own keys (space on a button, etc.).
      const target = event.target as HTMLElement;
      if (target.closest('button, input, select, [role="slider"]')) {
        if (event.key !== 'Escape' && event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
          return;
        }
      }
      const key = event.key.toLowerCase();
      const seekBy = (delta: number) => {
        setResumeOffered(true);
        remote.seek(currentTime + delta);
      };
      switch (key) {
        case ' ':
        case 'k':
          event.preventDefault();
          togglePlayback();
          break;
        case 'arrowleft':
        case 'j':
          event.preventDefault();
          seekBy(-10);
          break;
        case 'arrowright':
        case 'l':
          event.preventDefault();
          seekBy(10);
          break;
        case 'arrowup':
          event.preventDefault();
          remote.changeVolume(Math.min(1, volume + 0.1));
          break;
        case 'arrowdown':
          event.preventDefault();
          remote.changeVolume(Math.max(0, volume - 0.1));
          break;
        case 'm':
          remote.toggleMuted();
          break;
        case 'p':
          if (event.shiftKey && prevEpisode) {
            event.preventDefault();
            advanceTo(prevEpisode);
          }
          break;
        case 'n':
          if (event.shiftKey && nextEpisode) {
            event.preventDefault();
            advanceTo(nextEpisode);
          }
          break;
        case 'f':
          if (canFullscreen) remote.toggleFullscreen();
          break;
        case 'escape':
          if (fullscreen) remote.exitFullscreen();
          else if (menu || episodesOpen) {
            setMenu(null);
            setEpisodesOpen(false);
          } else onClose();
          break;
        default: {
          const digit = Number(key);
          if (Number.isInteger(digit) && duration > 0 && Number.isFinite(duration)) {
            event.preventDefault();
            setResumeOffered(true);
            remote.seek((duration * digit) / 10);
          }
        }
      }
      bumpActivity();
    },
    [
      remote,
      togglePlayback,
      volume,
      canFullscreen,
      fullscreen,
      onClose,
      menu,
      episodesOpen,
      duration,
      currentTime,
      bumpActivity,
      prevEpisode,
      nextEpisode,
      advanceTo,
    ],
  );

  // --- Scrubber ------------------------------------------------------------

  const displayTime = dragTime ?? currentTime;
  const progressPct = duration > 0 ? Math.min(100, (displayTime / duration) * 100) : 0;
  const bufferedPct = duration > 0 ? Math.min(100, (bufferedEnd / duration) * 100) : 0;

  const seekToPointer = useCallback(
    (clientX: number, bar: HTMLElement) => {
      if (duration <= 0 || !Number.isFinite(duration)) return;
      const rect = bar.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      const seconds = ratio * duration;
      setResumeOffered(true);
      remote.seek(seconds);
      setDragTime(seconds);
    },
    [duration, remote],
  );

  const onScrubPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    seekToPointer(event.clientX, event.currentTarget);
  };
  const onScrubPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    bumpActivity();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      seekToPointer(event.clientX, event.currentTarget);
    } else {
      const rect = event.currentTarget.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      setHoverTime(ratio * duration);
    }
  };
  const onScrubPointerUp = (event: React.PointerEvent<HTMLElement>) => {
    seekToPointer(event.clientX, event.currentTarget);
    setDragTime(null);
  };

  // --- Quality options -----------------------------------------------------

  // Hub-based resolutions lead: they're the advertised 480p/720p/1080p hubs
  // and work for every stream (including direct MKV/MP4 files, which expose
  // no hls.js levels). Only when a title advertises no linkList quality do we
  // fall back to the manifest levels — index must address the *unfiltered*
  // qualities list (changeQuality is index-based), so the original position
  // is captured before any entries are dropped. Levels that report height 0
  // are kept — dropping them hid every option and left only "Auto".
  const qualityOptions = useMemo<QualityOption[]>(() => {
    const hubs = (hubQualities ?? []).map((entry) => ({
      kind: 'hub' as const,
      label: entry.label,
      selected: entry.label === hubQuality,
    }));
    if (hubs.length > 0) return hubs;
    const items = qualities.map((q, index) => {
      const height = q.height > 0 ? `${q.height}p` : null;
      const bitrate = q.bitrate && q.bitrate > 0 ? `${Math.round(q.bitrate / 1000)} kbps` : null;
      return {
        kind: 'manifest' as const,
        index,
        label: height ?? bitrate ?? 'Quality',
        selected: quality?.height === q.height && q.height > 0,
      };
    });
    const auto = items.length === 0 || !quality || quality.height === 0;
    return [{ kind: 'manifest' as const, index: -1, label: 'Auto', selected: auto }, ...items];
  }, [hubQualities, hubQuality, qualities, quality]);

  // --- Audio options --------------------------------------------------------

  // App-level audio languages (multi-language WEB-DLs) lead, original first —
  // the resolver prefers provider order among equal ranks, so language[0] is
  // the original. Embedded audio tracks from the stream follow. Only the
  // first language is tagged "Original" when there's actually a choice.
  const audioOptions = useMemo<AudioOption[]>(() => {
    const languages = (audioLanguages ?? []).map((language, index) => ({
      kind: 'language' as const,
      label: language.label,
      selected: language.label === audioLanguage,
      original: index === 0 && (audioLanguages?.length ?? 0) > 1,
    }));
    const tracks = audioTracks
      .map((track, index) => ({
        kind: 'track' as const,
        index,
        label: trackLabel(track.label, track.language, index),
        selected: track.selected,
      }))
      .filter((option) => option.label !== '');
    return [...languages, ...tracks];
  }, [audioLanguages, audioLanguage, audioTracks]);

  // --- Subtitle options ----------------------------------------------------

  const subtitleOptions = useMemo(() => {
    const items = textTracks
      .map((track, index) => ({
        index,
        kind: track.kind,
        label: trackLabel(track.label, track.language, index),
        selected: track.mode === 'showing',
      }))
      .filter((option) => option.kind === 'subtitles' || option.kind === 'captions');
    const showing = items.findIndex((option) => option.selected);
    return [{ index: -1, label: 'Off', selected: showing < 0 }, ...items];
  }, [textTracks]);

  const selectSubtitle = useCallback(
    (index: number) => {
      // Turning off: disable whatever is currently showing.
      if (index < 0) {
        const showing = textTracks.findIndex((track) => track.mode === 'showing');
        if (showing >= 0) remote.changeTextTrackMode(showing, 'disabled');
        return;
      }
      // Switching tracks: disable any other showing track first so captions
      // don't stack, then show the requested one.
      textTracks.forEach((track, i) => {
        if (i !== index && track.mode === 'showing') {
          remote.changeTextTrackMode(i, 'disabled');
        }
      });
      remote.changeTextTrackMode(index, 'showing');
    },
    [textTracks, remote],
  );

  // Tabs shared by the settings panel; Audio/Subtitles appear only when the
  // stream actually advertises tracks (HLS multi-language WEB-DLs do).
  const settingsTabs = useMemo(() => {
    const tabs: {
      id: 'quality' | 'speed' | 'audio' | 'subtitles';
      label: string;
      Icon: typeof Monitor;
    }[] = [
      { id: 'quality', label: 'Quality', Icon: Monitor },
      { id: 'speed', label: 'Speed', Icon: Gauge },
    ];
    if (audioOptions.length > 0) tabs.push({ id: 'audio', label: 'Audio', Icon: Languages });
    // "Off" is always the first entry, so a tab is only worth showing when a
    // real subtitle track exists (length > 1).
    if (subtitleOptions.length > 1) {
      tabs.push({ id: 'subtitles', label: 'Subtitles', Icon: Captions });
    }
    return tabs;
  }, [audioOptions.length, subtitleOptions.length]);

  // --- Render --------------------------------------------------------------

  const showCenter = paused || waiting || ended;

  return (
    <div
      className={cn(
        'group/stage absolute inset-0 z-10 bg-transparent outline-hidden',
        !controlsVisible && playing && 'cursor-none',
      )}
      role="application"
      aria-label={`Video player for ${title}`}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: the stage is the keyboard scope for the media shortcuts (space/k, arrows, j/l, m, f), mirroring a focused <video> element.
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerMove={bumpActivity}
      onClick={(event) => {
        if (!(event.target as HTMLElement).closest('[data-player-control]')) togglePlayback();
      }}
      onDoubleClick={() => {
        if (canFullscreen) remote.toggleFullscreen();
      }}
    >
      {/* Fail-loud overlay (source exhausted / unreachable). */}
      {stalledMessage && (
        <div
          data-player-control
          className="pointer-events-none absolute inset-0 z-20 grid place-items-center bg-black/50 px-4"
        >
          <p className="max-w-md text-center text-sm text-white/80">{stalledMessage}</p>
        </div>
      )}

      {/* Center play / buffering / replay. */}
      {!stalledMessage && showCenter && (
        <div
          data-player-control
          className={cn(
            'pointer-events-none absolute inset-0 z-10 grid place-items-center',
            controlsVisible || paused ? 'opacity-100' : 'opacity-0',
            'transition-opacity duration-200',
          )}
        >
          {waiting ? (
            <LoaderCircle className="size-14 animate-spin text-white/90" aria-hidden="true" />
          ) : ended ? (
            <motion.button
              type="button"
              onClick={() => {
                setResumeOffered(true);
                remote.seek(0);
                remote.play();
              }}
              aria-label="Replay"
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.94 }}
              transition={SPRING}
              className="pointer-events-auto grid size-16 place-items-center rounded-full bg-white/20 text-white backdrop-blur hover:bg-white/30"
            >
              <RotateCcw className="size-7" />
            </motion.button>
          ) : (
            <motion.button
              type="button"
              onClick={togglePlayback}
              aria-label="Play"
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.94 }}
              transition={SPRING}
              className="pointer-events-auto grid size-16 place-items-center rounded-full bg-white/20 text-white backdrop-blur hover:bg-white/30"
            >
              <Play className="ml-1 size-8 fill-current" />
            </motion.button>
          )}
        </div>
      )}

      {/* Resume prompt (Netflix-style, over the paused poster). */}
      <AnimatePresence>
        {showResumePrompt && (
          <motion.div
            data-player-control
            className="absolute inset-x-0 bottom-24 z-10 flex flex-col items-center gap-3 px-4 sm:bottom-28"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={SPRING}
          >
            <p className="text-center text-sm text-white/90 sm:text-base">
              Resume from {formatTime(savedPosition ?? 0)}?
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={offerResume}
                className="touch-target rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:brightness-110"
              >
                <Play className="mr-1 inline size-3.5 fill-current" /> Resume
              </button>
              <button
                type="button"
                onClick={restart}
                className="touch-target rounded-md bg-white/15 px-4 py-2 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/25"
              >
                Start over
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top gradient bar: back + title. */}
      <motion.div
        data-player-control
        className={cn(
          'absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/80 to-transparent pl-[max(0.75rem,env(safe-area-inset-left))] pr-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-8 sm:px-4',
          !controlsVisible && 'pointer-events-none',
        )}
        initial={false}
        animate={{ opacity: controlsVisible ? 1 : 0, y: controlsVisible ? 0 : -10 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close player"
            className="touch-target grid size-9 shrink-0 place-items-center rounded-full text-white transition hover:bg-white/15"
          >
            <ArrowLeft className="size-5" />
          </button>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white sm:text-base">{title}</p>
            {activeEpisodeTitle && (
              <p className="truncate text-[11px] text-white/60 sm:text-xs">{activeEpisodeTitle}</p>
            )}
          </div>
        </div>
      </motion.div>

      {/* Bottom gradient bar: scrubber + transport controls. */}
      <motion.div
        data-player-control
        className={cn(
          'absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/80 to-transparent px-3 pt-10 pb-[max(0.5rem,env(safe-area-inset-bottom))] pr-[max(0.75rem,env(safe-area-inset-right))] sm:px-4',
          !controlsVisible && 'pointer-events-none',
        )}
        initial={false}
        animate={{ opacity: controlsVisible ? 1 : 0, y: controlsVisible ? 0 : 10 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
      >
        <div
          className="group/scrub relative mx-1 h-1 cursor-pointer rounded-full bg-white/20 transition-[height] hover:h-1.5"
          onPointerDown={onScrubPointerDown}
          onPointerMove={onScrubPointerMove}
          onPointerUp={onScrubPointerUp}
          onPointerLeave={() => setHoverTime(null)}
        >
          {/* Buffered + progress use scaleX (transform) so the scrubber
              never triggers layout; a spring smooths the ticks. */}
          <motion.div
            className="absolute inset-y-0 left-0 origin-left rounded-full bg-white/25"
            initial={false}
            animate={{ scaleX: bufferedPct / 100 }}
            transition={{ type: 'spring', stiffness: 150, damping: 26 }}
          />
          <motion.div
            className="absolute inset-y-0 left-0 origin-left rounded-full bg-primary"
            initial={false}
            animate={{ scaleX: progressPct / 100 }}
            transition={{ type: 'spring', stiffness: 150, damping: 26 }}
          />
          <motion.div
            className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary opacity-0 shadow transition-opacity group-hover/scrub:opacity-100"
            initial={false}
            animate={{ left: `${progressPct}%` }}
            transition={{ type: 'spring', stiffness: 220, damping: 28 }}
          />
          {hoverTime !== null && dragTime === null && duration > 0 && (
            <div
              className="pointer-events-none absolute -top-8 -translate-x-1/2 rounded bg-black/90 px-1.5 py-0.5 text-[11px] font-medium text-white"
              style={{ left: `${Math.min(100, (hoverTime / duration) * 100)}%` }}
            >
              {formatTime(hoverTime)}
            </div>
          )}
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-white sm:gap-2">
          <button
            type="button"
            onClick={togglePlayback}
            aria-label={paused ? 'Play' : 'Pause'}
            className="touch-target grid size-9 place-items-center rounded-full transition hover:bg-white/15"
          >
            {paused ? <Play className="size-5 fill-current" /> : <Pause className="size-5" />}
          </button>
          <button
            type="button"
            onClick={() => {
              setResumeOffered(true);
              remote.seek(currentTime - 10);
            }}
            aria-label="Seek back 10 seconds"
            className="touch-target grid size-9 place-items-center rounded-full transition hover:bg-white/15"
          >
            <SkipBack className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setResumeOffered(true);
              remote.seek(currentTime + 10);
            }}
            aria-label="Seek forward 10 seconds"
            className="touch-target grid size-9 place-items-center rounded-full transition hover:bg-white/15"
          >
            <SkipForward className="size-5" />
          </button>

          {/* Episode navigation — series only. Sits with the transport
              controls (play/pause/skip) so switching episodes never requires
              leaving the video surface; disabled at the list boundaries. */}
          {episodes.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => prevEpisode && advanceTo(prevEpisode)}
                disabled={!prevEpisode}
                aria-label="Previous episode"
                title="Previous episode"
                className="touch-target grid size-9 place-items-center rounded-full transition hover:bg-white/15 disabled:pointer-events-none disabled:opacity-30"
              >
                <ChevronLeft className="size-5" />
              </button>
              <button
                type="button"
                onClick={() => nextEpisode && advanceTo(nextEpisode)}
                disabled={!nextEpisode}
                aria-label="Next episode"
                title="Next episode"
                className="touch-target grid size-9 place-items-center rounded-full transition hover:bg-white/15 disabled:pointer-events-none disabled:opacity-30"
              >
                <ChevronRight className="size-5" />
              </button>
            </>
          )}

          <div className="ml-1 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => remote.toggleMuted()}
              aria-label={muted ? 'Unmute' : 'Mute'}
              className="touch-target grid size-9 place-items-center rounded-full transition hover:bg-white/15"
            >
              {muted || volume === 0 ? (
                <VolumeX className="size-5" />
              ) : (
                <Volume2 className="size-5" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => {
                const next = Number(e.target.value);
                remote.changeVolume(next);
                if (muted && next > 0) remote.toggleMuted();
              }}
              aria-label="Volume"
              className="w-16 accent-primary sm:w-20"
            />
          </div>

          <span className="ml-1 text-xs font-medium text-white/90 tabular-nums sm:text-sm">
            {formatTime(displayTime)} / {formatTime(duration)}
          </span>

          <div className="ml-auto flex items-center gap-1.5">
            {/* Episodes: only meaningful for series — opens a searchable
                list over the video so you can switch without leaving the
                player (mirrors the episode list under the player). */}
            {episodes.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setMenu(null);
                  setEpisodesOpen((open) => !open);
                }}
                aria-label="Episodes"
                aria-expanded={episodesOpen}
                className={cn(
                  'touch-target grid size-9 place-items-center rounded-full transition hover:bg-white/15',
                  episodesOpen && 'bg-white/15',
                )}
              >
                <ListVideo className="size-5" />
              </button>
            )}
            {/* Subtitles: jumps straight to the subtitle picker in settings.
                Only rendered when the stream advertises caption/subtitle
                tracks (Off alone means there is nothing to pick). */}
            {subtitleOptions.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  setEpisodesOpen(false);
                  setMenu(menu === 'subtitles' ? null : 'subtitles');
                }}
                aria-label="Subtitles"
                aria-expanded={menu === 'subtitles'}
                className={cn(
                  'touch-target grid size-9 place-items-center rounded-full transition hover:bg-white/15',
                  menu === 'subtitles' && 'bg-white/15',
                )}
              >
                <Captions className="size-5" />
              </button>
            )}
            {/* Settings doubles as the quality/speed/audio/subtitles menu
                toggle, so it's always available regardless of how many
                quality options the stream advertises. */}
            <button
              type="button"
              onClick={() => {
                setEpisodesOpen(false);
                setMenu(menu ? null : 'quality');
              }}
              aria-label="Settings"
              className={cn(
                'touch-target grid size-9 place-items-center rounded-full transition hover:bg-white/15',
                menu && 'bg-white/15',
              )}
            >
              <Settings className="size-5" />
            </button>
            {canPictureInPicture && (
              <button
                type="button"
                onClick={() => remote.togglePictureInPicture()}
                aria-label="Picture in picture"
                className="touch-target grid size-9 place-items-center rounded-full transition hover:bg-white/15"
              >
                <PictureInPicture className="size-5" />
              </button>
            )}
            {canFullscreen && (
              <button
                type="button"
                onClick={() => remote.toggleFullscreen()}
                aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                className="touch-target grid size-9 place-items-center rounded-full transition hover:bg-white/15"
              >
                {fullscreen ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
              </button>
            )}
          </div>
        </div>
      </motion.div>

      {/* Settings panel: quality + speed + audio + subtitles. */}
      <AnimatePresence>
        {menu && (
          <motion.div
            data-player-control
            className="absolute right-3 bottom-20 z-20 w-60 origin-bottom-right overflow-hidden rounded-lg border border-white/10 bg-black/90 text-white shadow-2xl backdrop-blur sm:right-4 sm:w-64"
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={SPRING}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
              <p className="text-xs font-semibold tracking-wide text-white/60 uppercase">
                {settingsTabs.find((tab) => tab.id === menu)?.label ?? 'Settings'}
              </p>
              <button
                type="button"
                onClick={() => setMenu(null)}
                aria-label="Close settings"
                className="touch-target grid size-6 place-items-center rounded-full hover:bg-white/15"
              >
                <X className="size-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-4 border-b border-white/10">
              {settingsTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setMenu(tab.id)}
                  aria-pressed={menu === tab.id}
                  className={cn(
                    'touch-target flex flex-col items-center gap-1 py-2 text-[10px] font-medium transition hover:bg-white/10',
                    menu === tab.id ? 'bg-white/10 text-white' : 'text-white/50',
                  )}
                >
                  <tab.Icon className="size-3.5" />
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="max-h-48 overflow-y-auto py-1">
              {menu === 'quality' &&
                (qualityOptions.length <= 1 ? (
                  <p className="px-3 py-2 text-xs text-white/50">
                    Single quality — the stream plays at its only rendition.
                  </p>
                ) : (
                  qualityOptions.map((option) => (
                    <button
                      key={option.kind === 'hub' ? option.label : `level-${option.index}`}
                      type="button"
                      onClick={() => {
                        if (option.kind === 'hub') {
                          onSelectQuality?.(option.label);
                        } else {
                          remote.changeQuality(option.index);
                        }
                        setMenu(null);
                      }}
                      className={cn(
                        'touch-target flex w-full items-center justify-between gap-2 px-3 py-1.5 text-sm transition hover:bg-white/10',
                        option.selected && 'font-semibold text-primary',
                      )}
                    >
                      <span className="min-w-0 truncate">{option.label}</span>
                      {option.selected && (
                        <span className="size-1.5 shrink-0 rounded-full bg-primary" />
                      )}
                    </button>
                  ))
                ))}
              {menu === 'speed' &&
                PLAYBACK_RATES.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setRate(value);
                      remote.changePlaybackRate(value);
                      setMenu(null);
                    }}
                    className={cn(
                      'touch-target flex w-full items-center justify-between px-3 py-1.5 text-sm transition hover:bg-white/10',
                      value === rate && 'font-semibold text-primary',
                    )}
                  >
                    {value === 1 ? 'Normal' : `${value}x`}
                    {value === rate && <span className="size-1.5 rounded-full bg-primary" />}
                  </button>
                ))}
              {menu === 'audio' &&
                audioOptions.map((option) => (
                  <button
                    key={
                      option.kind === 'track' ? `track-${option.index}` : `language-${option.label}`
                    }
                    type="button"
                    onClick={() => {
                      if (option.kind === 'language') {
                        onSelectLanguage?.(option.label);
                      } else {
                        remote.changeAudioTrack(option.index);
                      }
                      setMenu(null);
                    }}
                    className={cn(
                      'touch-target flex w-full items-center justify-between gap-2 px-3 py-1.5 text-sm transition hover:bg-white/10',
                      option.selected && 'font-semibold text-primary',
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate">{option.label}</span>
                      {option.kind === 'language' && option.original && (
                        <span className="shrink-0 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white/60">
                          Original
                        </span>
                      )}
                    </span>
                    {option.selected && (
                      <span className="size-1.5 shrink-0 rounded-full bg-primary" />
                    )}
                  </button>
                ))}
              {menu === 'subtitles' &&
                subtitleOptions.map((option) => (
                  <button
                    key={option.index}
                    type="button"
                    onClick={() => {
                      selectSubtitle(option.index);
                      setMenu(null);
                    }}
                    className={cn(
                      'touch-target flex w-full items-center justify-between px-3 py-1.5 text-sm transition hover:bg-white/10',
                      option.selected && 'font-semibold text-primary',
                    )}
                  >
                    {option.label}
                    {option.selected && <span className="size-1.5 rounded-full bg-primary" />}
                  </button>
                ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Episodes panel — in-player episode switcher for series. */}
      <AnimatePresence>
        {episodesOpen && (
          <motion.div
            data-player-control
            className="absolute right-3 bottom-20 z-20 w-72 max-w-[calc(100%-1.5rem)] origin-bottom-right overflow-hidden rounded-lg border border-white/10 bg-black/90 text-white shadow-2xl backdrop-blur sm:right-4 sm:w-80"
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={SPRING}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
              <p className="text-xs font-semibold tracking-wide text-white/60 uppercase">
                Episodes
              </p>
              <button
                type="button"
                onClick={() => setEpisodesOpen(false)}
                aria-label="Close episodes"
                className="touch-target grid size-6 place-items-center rounded-full hover:bg-white/15"
              >
                <X className="size-3.5" />
              </button>
            </div>
            <div className="max-h-[40vh] overflow-y-auto py-1">
              {episodes.map((episode, i) => {
                const number = String(i + 1);
                const active =
                  activeEpisode === number ||
                  activeEpisode === episode.link ||
                  activeEpisode === titleFor(episode);
                return (
                  <button
                    key={episode.link}
                    type="button"
                    onClick={() => {
                      onSelectEpisode(episode);
                      setEpisodesOpen(false);
                    }}
                    aria-current={active ? 'true' : undefined}
                    className={cn(
                      'touch-target flex w-full items-baseline gap-2 px-3 py-2 text-left text-sm transition hover:bg-white/10',
                      active && 'bg-white/10',
                    )}
                  >
                    <span
                      className={cn(
                        'shrink-0 text-xs font-semibold tabular-nums',
                        active ? 'text-primary' : 'text-white/40',
                      )}
                    >
                      E{number}
                    </span>
                    <span
                      className={cn(
                        'min-w-0 flex-1 truncate',
                        active ? 'font-semibold text-white' : 'text-white/80',
                      )}
                    >
                      {titleFor(episode)}
                    </span>
                    {active && <span className="size-1.5 shrink-0 rounded-full bg-primary" />}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Next-episode card (Netflix-style countdown when autoAdvance is on). */}
      <AnimatePresence>
        {nextOffer && (
          <motion.div
            data-player-control
            className="absolute right-3 bottom-20 z-20 flex max-w-[min(22rem,calc(100%-1.5rem))] items-end gap-3 rounded-xl bg-black/85 p-3 text-white shadow-2xl backdrop-blur sm:right-4"
            initial={{ opacity: 0, x: 28, scale: 0.97 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 28, scale: 0.97 }}
            transition={SPRING}
          >
            <div className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-md bg-black sm:w-32">
              <Image
                src={imageUrl(item.image)}
                alt=""
                fill
                sizes="128px"
                className="object-cover"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium tracking-wide text-white/60 uppercase">
                Next episode
              </p>
              <p className="mt-0.5 truncate text-sm font-semibold">{titleFor(nextOffer.episode)}</p>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => advanceTo(nextOffer.episode)}
                  className="touch-target rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:brightness-110"
                >
                  <Play className="mr-1 inline size-3 fill-current" />
                  {autoAdvance ? `Play now (${nextOffer.remaining})` : 'Play'}
                </button>
                <button
                  type="button"
                  onClick={cancelCountdown}
                  aria-label="Dismiss next episode"
                  className="touch-target grid size-7 place-items-center rounded-full text-white/70 transition hover:bg-white/15 hover:text-white"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="mt-2.5 h-0.5 overflow-hidden rounded-full bg-white/15">
                <motion.div
                  className="h-full origin-left rounded-full bg-primary"
                  initial={false}
                  animate={{
                    scaleX:
                      autoAdvance && NEXT_COUNTDOWN_S > 0
                        ? Math.max(0, nextOffer.remaining / NEXT_COUNTDOWN_S)
                        : 1,
                  }}
                  transition={{ type: 'spring', stiffness: 120, damping: 22 }}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
