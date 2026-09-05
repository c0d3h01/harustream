'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { episodes as fetchEpisodes, sources as fetchSources } from '@/lib/api/client';
import { useProgress, useSettings } from '@/lib/storage';
import { orderSources } from '@/services/normalize';
import type { Episode, Media, StreamSource } from '@/types';
import { clearFailedSources, SourceQueue } from './queue';

type PlaybackSession = {
  activeEpisode: Episode | undefined;
  source: StreamSource | undefined;
  /** Full episode list for the current media. */
  episodes: Episode[];
  /** All resolved sources for the active episode. */
  allSources: readonly StreamSource[];
  loading: boolean;
  error: string | null;
  progress: ReturnType<typeof useProgress>;
  sourceFailed: () => void;
  ended: () => void;
  /** Clear source-failure memory and re-resolve for the current episode. */
  retry: () => void;
  /** Jump to a specific episode. */
  selectEpisode: (episode: Episode) => void;
  /** Switch to a specific source (server). */
  selectSource: (sourceId: string) => void;
};

export function usePlaybackSession(
  item: Media,
  initialEpisodeRef?: string,
  onEpisodeChange?: (episode: Episode) => void,
): PlaybackSession {
  const progress = useProgress(item.providerId);
  const { settings } = useSettings();
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [activeEpisode, setActiveEpisode] = useState<Episode>();
  const [source, setSource] = useState<StreamSource>();
  const [allSources, setAllSources] = useState<readonly StreamSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const queueRef = useRef<SourceQueue | undefined>(undefined);
  const generationRef = useRef(0);
  const [sourcesNonce, setSourcesNonce] = useState(0);

  const providerId = item.providerId;
  const itemRef = item.ref;
  const itemKind = item.kind;
  const groups = item.groups;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    if (itemKind === 'movie') {
      const target = groups.flatMap((group) => group.items)[0];
      setEpisodes([]);
      setActiveEpisode(
        target ? { id: target.id, title: target.label, ref: target.ref } : undefined,
      );
      setLoading(false);
      return () => controller.abort();
    }
    const directGroup = groups.find((group) => group.kind === 'direct' && group.items.length);
    if (directGroup) {
      const directEpisodes = directGroup.items.map((entry) => ({
        id: entry.id,
        title: entry.label,
        ref: entry.ref,
      }));
      setEpisodes(directEpisodes);
      setActiveEpisode(
        directEpisodes.find((episode) => episode.ref === initialEpisodeRef) ?? directEpisodes[0],
      );
      setLoading(false);
      return () => controller.abort();
    }
    const episodeGroup = groups.find((group) => group.kind === 'episodes' && group.ref);
    if (!episodeGroup?.ref) {
      setEpisodes([]);
      setActiveEpisode(undefined);
      setLoading(false);
      return () => controller.abort();
    }
    fetchEpisodes(providerId, episodeGroup.ref, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setEpisodes(result);
        setActiveEpisode(result.find((episode) => episode.ref === initialEpisodeRef) ?? result[0]);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : 'Episodes could not be loaded');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [initialEpisodeRef, providerId, itemKind, groups]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: retry() bumps sourcesNonce to force a re-fetch
  useEffect(() => {
    if (!activeEpisode?.ref) return;
    const episodeRef = activeEpisode.ref;
    const controller = new AbortController();
    const generation = ++generationRef.current;
    setLoading(true);
    setError(null);
    setSource(undefined);
    setAllSources([]);
    queueRef.current = undefined;
    const scope = `${providerId}:${episodeRef}`;
    fetchSources(providerId, episodeRef, itemKind, controller.signal)
      .then((result) => {
        if (controller.signal.aborted || generation !== generationRef.current) return;
        const queue = new SourceQueue(orderSources(result), scope);
        queueRef.current = queue;
        setAllSources(queue.sources);
        setSource(queue.nextSource());
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted && generation === generationRef.current) {
          setError(reason instanceof Error ? reason.message : 'Sources could not be loaded');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted && generation === generationRef.current) setLoading(false);
      });
    // Abort alone invalidates the generation; no extra increment (the next
    // effect run mints a fresh generation, avoiding double-step gaps).
    return () => controller.abort();
  }, [activeEpisode?.ref, providerId, itemKind, sourcesNonce]);

  // Warm the source cache for the next episode so auto-advance starts fast.
  useEffect(() => {
    if (itemKind === 'movie' || !settings.autoAdvance || episodes.length < 2) return;
    const index = activeEpisode ? episodes.findIndex((entry) => entry.id === activeEpisode.id) : -1;
    const next = index >= 0 ? episodes[index + 1] : undefined;
    if (!next?.ref) return;
    const controller = new AbortController();
    fetchSources(providerId, next.ref, itemKind, controller.signal).catch(() => {});
    return () => controller.abort();
  }, [activeEpisode?.id, episodes, itemKind, providerId, settings.autoAdvance]);

  const sourceFailed = useCallback(() => {
    const next = queueRef.current?.failCurrent();
    setSource(next);
    if (!next) setError('Every available source failed. Try another episode or try again later.');
  }, []);

  const retry = useCallback(() => {
    clearFailedSources();
    setError(null);
    setSource(undefined);
    setAllSources([]);
    queueRef.current = undefined;
    setSourcesNonce((nonce) => nonce + 1);
  }, []);

  const ended = useCallback(() => {
    if (!activeEpisode) return;
    progress.clear(itemRef, activeEpisode.ref);
    const index = episodes.findIndex((entry) => entry.id === activeEpisode.id);
    const next = settings.autoAdvance ? episodes[index + 1] : undefined;
    if (next) {
      setActiveEpisode(next);
      onEpisodeChange?.(next);
    }
  }, [activeEpisode, episodes, itemRef, onEpisodeChange, progress.clear, settings.autoAdvance]);

  const selectEpisode = useCallback(
    (episode: Episode) => {
      setActiveEpisode(episode);
      onEpisodeChange?.(episode);
    },
    [onEpisodeChange],
  );

  const selectSource = useCallback((sourceId: string) => {
    const selected = queueRef.current?.select(sourceId);
    if (selected) setSource(selected);
  }, []);

  return {
    activeEpisode,
    source,
    episodes,
    allSources,
    loading,
    error,
    progress,
    sourceFailed,
    ended,
    retry,
    selectEpisode,
    selectSource,
  };
}
