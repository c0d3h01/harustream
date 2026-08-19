'use client';

import { MediaPlayer, MediaProvider, type PlayerSrc } from '@vidstack/react';
import { ChevronLeft } from 'lucide-react';
import { motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SPRING_SOFT } from '@/components/motion/transitions';
import { Button } from '@/components/ui/button';
import { type Episode, type Media, resolveStream, type Stream, titleFor } from '@/lib/api/client';
import { usePlaybackRate } from '@/lib/hooks/usePlaybackRate';
import { useProgress } from '@/lib/hooks/useProgress';
import { useScrollLock } from '@/lib/hooks/useScrollLock';
import { imageUrl } from '@/lib/media/images';
import { playbackUrl } from '@/lib/media/playback';
import { EpisodeList } from './EpisodeList';
import { PlayerStage } from './PlayerStage';

type Props = {
  item: Media;
  stream?: Stream;
  episodes: Episode[];
  activeEpisode: string;
  loading: boolean;
  errorMessage?: string;
  defaultPlaybackRate?: number;
  autoAdvance: boolean;
  provider: string;
  onClose: () => void;
  onSelectEpisode: (item: Episode) => void;
  onSourcesExhausted: () => void;
};

// A source that stalls this long without loading metadata is dead — fall
// through to the next source instead of hanging the player.
const SOURCE_STALL_TIMEOUT_MS = 20_000;

export function PlayerModal({
  item,
  stream,
  episodes,
  activeEpisode,
  loading,
  errorMessage,
  defaultPlaybackRate,
  autoAdvance,
  provider,
  onClose,
  onSelectEpisode,
  onSourcesExhausted,
}: Props) {
  const progress = useProgress(provider);
  const { rate, setRate } = usePlaybackRate(defaultPlaybackRate);

  const [stalledMessage, setStalledMessage] = useState<string | null>(null);

  const resolved = resolveStream(stream);
  const sources = resolved.kind === 'sources' ? resolved.sources : [];
  const [sourceIndex, setSourceIndex] = useState(0);
  const source = sources[sourceIndex]?.link;
  const sourceHeaders = sources[sourceIndex]?.headers;

  // A source that never sends bytes (dead CDN, redirect loop, download-only
  // links) fires no error event — the player would hang on its spinner
  // forever. If the current source hasn't reached loadedmetadata within the
  // window, treat it as dead and fall through to the next source — or hand
  // over to the hub/episode fallback when the stream's sources are done.
  const sourceLoadedRef = useRef(false);
  const advanceIfStalled = useCallback(() => {
    if (sourceLoadedRef.current) return;
    if (sourceIndex < sources.length - 1) {
      setSourceIndex((index) => index + 1);
      return;
    }
    onSourcesExhausted();
  }, [sourceIndex, sources.length, onSourcesExhausted]);

  // A new stream (new title, episode, or quality set) always starts on the
  // first source; otherwise an index left over from a longer list would
  // point past the end and the player would show "no stream".
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally re-runs when the stream changes even though the body only uses the stable setter.
  useEffect(() => {
    setSourceIndex(0);
    setStalledMessage(null);
  }, [stream]);

  const savedPosition = source ? progress.get(item.link, activeEpisode)?.position : undefined;

  // (Re)arm the stall timer whenever the source changes: the timer is cleared
  // as soon as the source loads its metadata.
  useEffect(() => {
    sourceLoadedRef.current = false;
    if (!source) return;
    const timer = window.setTimeout(advanceIfStalled, SOURCE_STALL_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [source, advanceIfStalled]);

  // Every source goes through the server-side stream proxy, which injects
  // the provider-required headers (Referer/Origin/Cookie) advertised on the
  // stream; Vidstack picks the HLS provider for m3u8 manifests and the
  // native video provider for MP4s/MKVs. Unsupported containers surface as
  // an error here and fall through to the next source.
  const playerSrc: PlayerSrc = source ? playbackUrl(source, sourceHeaders) : '';

  const handleEnded = useCallback(() => {
    progress.clear(item.link, activeEpisode);
  }, [item.link, activeEpisode, progress.clear]);

  useScrollLock();

  return (
    // AnimatePresence in App drives the enter/exit; transform/opacity only.
    <motion.div
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto overscroll-contain bg-background pt-safe pb-safe"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={SPRING_SOFT}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-3 p-3 sm:gap-4 sm:p-6 lg:p-8">
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" size="sm" onClick={onClose} className="touch-target shrink-0">
            <ChevronLeft className="size-4" />
            <span className="hidden sm:inline">Back to browse</span>
            <span className="sm:hidden">Back</span>
          </Button>
          <span className="truncate px-2 text-sm font-semibold">{titleFor(item)}</span>
          <span className="size-7 sm:size-16" aria-hidden="true" />
        </div>

        <div className="overflow-hidden rounded-xl bg-black shadow-2xl">
          <div className="relative aspect-video">
            {source ? (
              <MediaPlayer
                src={playerSrc}
                title={titleFor(item)}
                poster={imageUrl(item.image)}
                playsInline
                aspectRatio="16/9"
                onError={() => {
                  if (sourceIndex < sources.length - 1) {
                    setStalledMessage(null);
                    setSourceIndex((index) => index + 1);
                    return;
                  }
                  // Every source of this stream is dead — hand over to the
                  // hub/episode fallback instead of failing the playback.
                  setStalledMessage(null);
                  onSourcesExhausted();
                }}
                onLoadedMetadata={() => {
                  sourceLoadedRef.current = true;
                }}
              >
                <MediaProvider />
                <PlayerStage
                  source={source}
                  savedPosition={savedPosition}
                  rate={rate}
                  setRate={setRate}
                  autoAdvance={autoAdvance}
                  stalledMessage={stalledMessage}
                  item={item}
                  episodes={episodes}
                  activeEpisode={activeEpisode}
                  onSelectEpisode={onSelectEpisode}
                  onClose={onClose}
                  onEnded={handleEnded}
                  progress={progress}
                />
              </MediaPlayer>
            ) : (
              <div className="grid size-full place-items-center px-6 text-center text-muted-foreground">
                <div>
                  {stalledMessage ? (
                    <p className="text-base font-semibold text-foreground">{stalledMessage}</p>
                  ) : (
                    <p className="text-sm sm:text-base">
                      {errorMessage ??
                        (loading
                          ? 'Finding the best stream...'
                          : 'No playable stream was returned for this title.')}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-2 grid gap-4 lg:mt-6 lg:grid-cols-[1fr_280px] lg:gap-6">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold sm:text-2xl">{titleFor(item)}</h1>
            {episodes.length === 0 && loading && (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Getting this ready to watch…
              </p>
            )}
          </div>
          <EpisodeList
            episodes={episodes}
            activeEpisode={activeEpisode}
            onSelect={onSelectEpisode}
          />
        </div>
      </div>
    </motion.div>
  );
}
