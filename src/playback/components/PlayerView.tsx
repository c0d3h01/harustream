'use client';

import { MediaPlayer, MediaProvider, type PlayerSrc, useMediaProvider } from '@vidstack/react';
import { type ComponentProps, useCallback, useEffect, useRef, useState } from 'react';
import type { Episode, Media, StreamSource, Subtitle } from '@/types';
import { chooseEngine } from '../engine';
import { FailureDetector } from '../failure';
import { playbackUrl } from '../proxy';
import { remapSubtitleId } from '../subtitles';
import { PlayerControls } from './PlayerControls';

type Props = {
  item: Media;
  episodes: Episode[];
  activeEpisode?: Episode;
  sources: StreamSource[];
  source?: StreamSource;
  progress: ComponentProps<typeof PlayerControls>['progress'];
  onBack: () => void;
  onSource: (sourceId: string) => void;
  onSourceFailure: () => void;
  onEpisode: (episode: Episode) => void;
  onEnded: () => void;
};

function applyNativeSubtitleMode(tracks: HTMLTrackElement[], selectedId: string): void {
  for (const track of tracks) {
    track.track.mode = track.id === selectedId ? 'showing' : 'disabled';
  }
}

function NativeSubtitleTracks({
  subtitles,
  headers,
  selectedId,
}: {
  subtitles: Subtitle[];
  headers?: Record<string, string>;
  selectedId: string;
}) {
  const provider = useMediaProvider();
  const tracksRef = useRef<HTMLTrackElement[]>([]);
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;

  useEffect(() => {
    if (!provider || !('video' in provider)) return;
    const video = provider.video;
    if (!(video instanceof HTMLVideoElement)) return;
    const listeners = new Map<HTMLTrackElement, () => void>();
    const tracks = subtitles.map((subtitle) => {
      const track = document.createElement('track');
      track.id = subtitle.id;
      track.kind = 'subtitles';
      track.label = subtitle.label;
      track.srclang = subtitle.language;
      track.src = playbackUrl(subtitle.url, headers, subtitle.format);
      const positionCues = () => {
        for (const cue of track.track.cues ?? []) {
          if ('line' in cue) {
            const vttCue = cue as VTTCue;
            vttCue.snapToLines = false;
            vttCue.line = 60;
          }
        }
      };
      track.addEventListener('load', positionCues);
      listeners.set(track, positionCues);
      video.append(track);
      return track;
    });
    tracksRef.current = tracks;
    applyNativeSubtitleMode(tracks, selectedIdRef.current);
    return () => {
      for (const track of tracks) {
        const positionCues = listeners.get(track);
        if (positionCues) track.removeEventListener('load', positionCues);
        track.remove();
      }
      tracksRef.current = [];
    };
  }, [headers, provider, subtitles]);

  useEffect(() => {
    applyNativeSubtitleMode(tracksRef.current, selectedId);
  }, [selectedId]);

  return null;
}

function canPlayNative(mimeType: string): boolean {
  if (typeof document === 'undefined') return true;
  return document.createElement('video').canPlayType(mimeType) !== '';
}

export function PlayerView({
  item,
  episodes,
  activeEpisode,
  sources,
  source,
  progress,
  onBack,
  onSource,
  onSourceFailure,
  onEpisode,
  onEnded,
}: Props) {
  const detectorRef = useRef<FailureDetector | undefined>(undefined);
  const previousEpisodeRef = useRef<string | undefined>(undefined);
  const [subtitleId, setSubtitleId] = useState('');
  const subtitleLanguageRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!source || !subtitleId) return;
    const selected = source.subtitles.find((subtitle) => subtitle.id === subtitleId);
    if (selected) subtitleLanguageRef.current = selected.language;
  }, [source, subtitleId]);
  const failure = useCallback(() => onSourceFailure(), [onSourceFailure]);
  useEffect(() => {
    if (!source) return;
    const detector = new FailureDetector(20_000, failure);
    detectorRef.current = detector;
    detector.start();
    return () => {
      detector.stop();
      detectorRef.current = undefined;
    };
  }, [source, failure]);
  useEffect(() => {
    const episodeRef = activeEpisode?.ref;
    if (!episodeRef) return;
    if (previousEpisodeRef.current && previousEpisodeRef.current !== episodeRef) {
      setSubtitleId('');
    }
    previousEpisodeRef.current = episodeRef;
  }, [activeEpisode?.ref]);
  // Carry the subtitle choice across source switches: the new source exposes
  // its own track ids, so re-select by id and fall back to language.
  useEffect(() => {
    if (!source) return;
    setSubtitleId((current) => {
      if (!current) return current;
      return remapSubtitleId(current, source.subtitles, subtitleLanguageRef.current);
    });
  }, [source]);
  if (!source || !activeEpisode) return null;
  const engine = chooseEngine(source, canPlayNative);
  const sourceUrl = playbackUrl(source.url, source.headers);
  const mediaSource: PlayerSrc =
    engine === 'hls'
      ? { src: sourceUrl, type: 'application/x-mpegurl' as const }
      : source.format === 'mp4'
        ? { src: sourceUrl, type: 'video/mp4' as const }
        : sourceUrl;
  return (
    <div className="fixed inset-0 z-50 bg-black">
      <MediaPlayer
        src={mediaSource}
        title={item.displayTitle}
        playsInline
        autoplay={false}
        fullscreenOrientation="none"
        className="player-frame"
        onPlay={() => detectorRef.current?.setPlaying(true)}
        onPause={() => detectorRef.current?.setPlaying(false)}
        onSeeking={() => detectorRef.current?.setSeeking(true)}
        onSeeked={() => detectorRef.current?.setSeeking(false)}
        onError={() => detectorRef.current?.fatalError()}
        onLoadedMetadata={() => detectorRef.current?.markStarted()}
        onTimeUpdate={() => detectorRef.current?.markProgress()}
        onEnded={onEnded}
      >
        <MediaProvider />
        <NativeSubtitleTracks
          subtitles={source.subtitles}
          headers={source.headers}
          selectedId={subtitleId}
        />
        <PlayerControls
          item={item}
          episodeRef={activeEpisode.ref}
          episodeTitle={activeEpisode.title}
          episodes={episodes}
          source={source}
          sources={sources}
          subtitleId={subtitleId}
          progress={progress}
          onBack={onBack}
          onSource={onSource}
          onSubtitle={setSubtitleId}
          onEpisode={onEpisode}
        />
      </MediaPlayer>
    </div>
  );
}
