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
} from '@vidstack/react';

import {
  DefaultAudioLayout,
  DefaultVideoLayout,
  defaultLayoutIcons,
} from '@vidstack/react/player/layouts/default';
import { useEffect, useMemo, useRef, useState } from 'react';
import { playbackUrl, playerSrc } from '@/lib/media/playbackHref';
import type { Episode, Media, StreamSource } from '@/types';
import { FailureDetector } from './failure';
import { mediaPlaybackUrl } from './proxy';

// Live region for error announcements to screen readers
function ErrorAnnouncer({ message }: { message: string }) {
  return (
    <div role="alert" aria-live="assertive" aria-atomic="true" className="sr-only">
      {message}
    </div>
  );
}

type Props = {
  item: Media;
  activeEpisode?: Episode;
  source?: StreamSource;
  progress: {
    get: (ref: string, episodeRef?: string) => { position: number; duration: number } | undefined;
  };
  onSourceFailure: () => void;
  onEnded: () => void;
};

// Native MediaError codes: 1 aborted, 2 network, 3 decode, 4 unsupported.
// Only SRC_NOT_SUPPORTED is unrecoverable by definition — a network blip or
// decode hiccup gets one automatic reload before we fail over sources.
const MEDIA_ERR_SRC_NOT_SUPPORTED = 4;

export function PlayerView({
  item,
  activeEpisode,
  source,
  progress,
  onSourceFailure,
  onEnded,
}: Props) {
  const player = useRef<MediaPlayerInstance>(null);
  const detectorRef = useRef<FailureDetector | undefined>(undefined);
  const resumedRef = useRef(false);
  const lastTimeRef = useRef(0);
  const failureHandledRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [isReady, setIsReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!source) return;
    resumedRef.current = false;
    failureHandledRef.current = false;
    lastTimeRef.current = 0;
    setIsReady(false);
    const detector = new FailureDetector(20_000, () => {
      if (failureHandledRef.current) return;
      failureHandledRef.current = true;
      onSourceFailure();
    });
    detectorRef.current = detector;
    detector.start();
    return () => {
      detector.stop();
      detectorRef.current = undefined;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      retryTimerRef.current = undefined;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, onSourceFailure]);

  const src = useMemo<PlayerSrc | null>(() => {
    if (!source || !activeEpisode) return null;
    // Server-minted href preferred; legacy payloads fall back to the client builder.
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
      })) ?? [],
    [source],
  );

  if (!source || !activeEpisode || !src) return null;

  return (
    <>
      <MediaPlayer
        ref={player}
        className="player-viewport fixed inset-0 z-50 h-[100dvh] w-full bg-black"
        src={src}
        title={item.displayTitle}
        playsInline
        streamType="on-demand"
        viewType="video"
        aria-busy={!isReady}
        onLoadStart={() => detectorRef.current?.markStarted()}
        onPlay={() => detectorRef.current?.setPlaying(true)}
        onPause={() => detectorRef.current?.setPlaying(false)}
        onSeeking={() => detectorRef.current?.setSeeking(true)}
        onSeeked={() => detectorRef.current?.setSeeking(false)}
        onError={(detail) => {
          const code = (detail as { code?: number }).code;
          if (failureHandledRef.current) return;
          failureHandledRef.current = true;
          setErrorMessage(
            code === MEDIA_ERR_SRC_NOT_SUPPORTED
              ? 'Video format not supported. Trying next source.'
              : 'Playback error. Trying another source.',
          );
          retryTimerRef.current = setTimeout(() => setErrorMessage(null), 3000);
          detectorRef.current?.fatalError();
        }}
        onTimeUpdate={(detail) => {
          const time = (detail as { currentTime?: number }).currentTime;
          if (typeof time === 'number') lastTimeRef.current = time;
          detectorRef.current?.markProgress();
        }}
        onEnded={onEnded}
        onCanPlay={() => {
          if (resumedRef.current) return;
          resumedRef.current = true;
          setIsReady(true);
          const element = player.current?.el;
          const media = element?.querySelector('video');
          const duration = media && Number.isFinite(media.duration) ? media.duration : undefined;
          const recoverPosition = lastTimeRef.current;
          const saved = progress.get(item.ref, activeEpisode.ref);
          const candidate = recoverPosition > 5 ? recoverPosition : saved?.position;
          const position =
            candidate !== undefined && candidate > 5 && duration !== undefined
              ? Math.min(candidate, Math.max(0, duration - 10))
              : undefined;
          if (position !== undefined && media) media.currentTime = position;
        }}
        onProviderChange={(
          provider: MediaProviderAdapter | null,
          _nativeEvent: MediaProviderChangeEvent,
        ) => {
          // Both adaptive libraries load from the bundle — never a CDN.
          if (isHLSProvider(provider)) {
            provider.library = () => import('hls.js');
            provider.config = {
              enableWorker: true,
              lowLatencyMode: true,
              backBufferLength: 90,
              capLevelToPlayerSize: true,
            };
          } else if (isDASHProvider(provider)) {
            provider.library = async () => {
              const mod = await import('dashjs');
              const dash = ((mod as { default?: unknown }).default ?? mod) as typeof mod;
              return { default: dash };
            };
            // dashjs.LogLevel.NONE (5) — verbose defaults are a production leak.
            // Buffer settings prevent the SourceBuffer teardown race that logs
            // "getAllBufferRanges exception" during ABR quality switches.
            provider.config = {
              debug: { logLevel: 5 },
              streaming: {
                buffer: {
                  useChangeType: true,
                  resetSourceBuffersForTrackSwitch: false,
                  reuseExistingSourceBuffers: true,
                  initialBufferLevel: 30,
                },
                abr: {
                  rules: {
                    insufficientBufferRule: { active: false },
                    throughputRule: { active: true },
                  },
                },
              },
            };
          }
        }}
      >
        <MediaProvider>
          {item.posterUrl ? <Poster className="vds-poster" src={item.posterUrl} alt="" /> : null}
          {tracks.map((track) => (
            <Track key={track.id} {...track} />
          ))}
        </MediaProvider>
        <DefaultAudioLayout icons={defaultLayoutIcons} />
        <DefaultVideoLayout icons={defaultLayoutIcons} />
      </MediaPlayer>
      {errorMessage && <ErrorAnnouncer message={errorMessage} />}
    </>
  );
}
