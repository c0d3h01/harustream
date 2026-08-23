'use client';

import { MediaPlayer, MediaProvider, type PlayerSrc } from '@vidstack/react';
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

type Cue = {
  start: number;
  end: number;
  text: string;
};

function parseVttTime(value: string): number {
  const parts = value.trim().split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return parts[0] * 60 + parts[1];
}

function parseVtt(text: string): Cue[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const cues: Cue[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const timing = lines[index].match(
      /(\d{1,2}:\d{2}(?::\d{2})?\.\d{3})\s+-->\s+(\d{1,2}:\d{2}(?::\d{2})?\.\d{3})/,
    );
    if (!timing) continue;
    const cueLines: string[] = [];
    for (index += 1; index < lines.length && lines[index].trim(); index += 1) {
      cueLines.push(lines[index].replace(/<[^>]+>/g, ''));
    }
    cues.push({
      start: parseVttTime(timing[1]),
      end: parseVttTime(timing[2]),
      text: cueLines.join('\n'),
    });
  }
  return cues;
}

function SubtitleOverlay({
  subtitle,
  headers,
}: {
  subtitle?: Subtitle;
  headers?: Record<string, string>;
}) {
  const subtitleUrl = subtitle?.url;
  const proxiedSubtitleUrl = subtitleUrl ? playbackUrl(subtitleUrl, headers) : '';
  const cuesRef = useRef<Cue[]>([]);
  const overlayRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    cuesRef.current = [];
    if (!proxiedSubtitleUrl) return;
    const controller = new AbortController();
    fetch(proxiedSubtitleUrl, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Subtitle request failed: ${response.status}`);
        return response.text();
      })
      .then((text) => {
        cuesRef.current = parseVtt(text);
      })
      .catch(() => {
        if (!controller.signal.aborted) cuesRef.current = [];
      });
    return () => controller.abort();
  }, [proxiedSubtitleUrl]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      const currentTime = document.querySelector('video')?.currentTime ?? 0;
      const activeText = cuesRef.current
        .filter((cue) => currentTime >= cue.start && currentTime < cue.end)
        .map((cue) => cue.text)
        .join('\n');
      if (overlayRef.current) {
        overlayRef.current.textContent = activeText;
        overlayRef.current.style.display = activeText ? 'block' : 'none';
      }
    }, 200);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <div
      ref={overlayRef}
      className="pointer-events-none absolute inset-x-0 bottom-20 z-20 whitespace-pre-line px-6 text-center text-lg text-white [text-shadow:0_1px_3px_rgb(0_0_0)]"
      style={{ display: 'none' }}
    />
  );
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
  const engine = chooseEngine(source, () => false);
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
        className="h-full w-full"
        onError={() => detectorRef.current?.fatalError()}
        onLoadedMetadata={() => detectorRef.current?.markStarted()}
        onTimeUpdate={() => detectorRef.current?.markProgress()}
        onEnded={onEnded}
      >
        <MediaProvider />
        <SubtitleOverlay
          subtitle={source.subtitles.find((subtitle) => subtitle.id === subtitleId)}
          headers={source.headers}
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
