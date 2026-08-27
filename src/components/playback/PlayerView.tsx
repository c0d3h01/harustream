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
  const reloadAttemptRef = useRef(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!source) return;
    resumedRef.current = false;
    reloadAttemptRef.current = 0;
    lastTimeRef.current = 0;
    const detector = new FailureDetector(20_000, () => onSourceFailure());
    detectorRef.current = detector;
    detector.start();
    return () => {
      detector.stop();
      detectorRef.current = undefined;
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
        key={reloadKey}
        ref={player}
        className="fixed inset-0 z-50 h-full w-full bg-black"
        src={src}
        title={item.displayTitle}
        playsInline
        streamType="on-demand"
        viewType="video"
        aria-busy={!resumedRef.current}
        onLoadStart={() => detectorRef.current?.markStarted()}
        onPlay={() => detectorRef.current?.setPlaying(true)}
        onPause={() => detectorRef.current?.setPlaying(false)}
        onSeeking={() => detectorRef.current?.setSeeking(true)}
        onSeeked={() => detectorRef.current?.setSeeking(false)}
        onError={(detail) => {
          const code = (detail as { code?: number }).code;
          if (code !== MEDIA_ERR_SRC_NOT_SUPPORTED && reloadAttemptRef.current < 1) {
            reloadAttemptRef.current += 1;
            detectorRef.current?.stop();
            setReloadKey((key) => key + 1);
            return;
          }
          const errorMsg =
            code === MEDIA_ERR_SRC_NOT_SUPPORTED
              ? 'Video format not supported. Trying next source.'
              : 'Playback error. Retrying...';
          setErrorMessage(errorMsg);
          setTimeout(() => setErrorMessage(null), 3000);
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
          const recoverPosition = lastTimeRef.current;
          const saved = progress.get(item.ref, activeEpisode.ref);
          const position =
            recoverPosition > 5
              ? recoverPosition
              : saved && saved.position > 5 && saved.position < saved.duration - 10
                ? saved.position
                : undefined;
          if (position !== undefined) {
            player.current?.remoteControl.seek(position);
          }
        }}
        onProviderChange={(
          provider: MediaProviderAdapter | null,
          _nativeEvent: MediaProviderChangeEvent,
        ) => {
          // Both adaptive libraries load from the bundle — never a CDN.
          if (isHLSProvider(provider)) {
            provider.library = () => import('hls.js');
          } else if (isDASHProvider(provider)) {
            provider.library = async () => {
              const mod = await import('dashjs');
              const dash = ((mod as { default?: unknown }).default ?? mod) as typeof mod;
              (window as unknown as { dashjs?: unknown }).dashjs = dash;
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
