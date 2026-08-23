'use client';

import { MediaPlayer, MediaProvider, type PlayerSrc, Track } from '@vidstack/react';
import { type ComponentProps, useCallback, useEffect, useRef, useState } from 'react';
import type { Episode, Media, StreamSource, Subtitle } from '@/types';
import { chooseEngine } from '../engine';
import { FailureDetector } from '../failure';
import { playbackUrl } from '../proxy';
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

function SubtitleTracks({
  subtitles,
  headers,
}: {
  subtitles: Subtitle[];
  headers?: Record<string, string>;
}) {
  return (
    <>
      {subtitles.map((subtitle) => (
        <Track
          key={subtitle.id}
          id={subtitle.id}
          src={playbackUrl(subtitle.url, headers, subtitle.format)}
          kind="subtitles"
          label={subtitle.label}
          lang={subtitle.language}
          type="vtt"
        />
      ))}
    </>
  );
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
  const [subtitleId, setSubtitleId] = useState('');
  const playbackKey = `${source?.id ?? ''}:${activeEpisode?.ref ?? ''}`;
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
    if (!playbackKey) return;
    setSubtitleId('');
  }, [playbackKey]);
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
    <div className="player-shell fixed inset-0 z-50 bg-black">
      <MediaPlayer
        src={mediaSource}
        title={item.displayTitle}
        playsInline
        controls
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
        <MediaProvider>
          <SubtitleTracks subtitles={source.subtitles} headers={source.headers} />
        </MediaProvider>
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
