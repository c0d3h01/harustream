'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { episodes as fetchEpisodes, sources as fetchSources } from '@/lib/api/client';
import { useProgress, useSettings } from '@/lib/storage';
import { orderSources } from '@/services/normalize';
import type { Episode, Media, StreamSource } from '@/types';
import { SourceQueue } from '../queue';
import { nextEpisode } from '../resume';

type PlaybackSession = {
  episodes: Episode[];
  activeEpisode: Episode | undefined;
  sources: StreamSource[];
  source: StreamSource | undefined;
  loading: boolean;
  error: string | null;
  progress: ReturnType<typeof useProgress>;
  autoAdvance: boolean;
  selectEpisode: (episode: Episode) => void;
  selectSource: (sourceId: string) => void;
  sourceFailed: () => void;
  ended: () => void;
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
  const [sources, setSources] = useState<StreamSource[]>([]);
  const [source, setSource] = useState<StreamSource>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const queueRef = useRef<SourceQueue | undefined>(undefined);
  const generationRef = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    if (item.kind === 'movie') {
      const target = item.groups.flatMap((group) => group.items)[0];
      setEpisodes([]);
      setActiveEpisode(
        target ? { id: target.id, title: target.label, ref: target.ref } : undefined,
      );
      setLoading(false);
      return () => controller.abort();
    }
    const directGroup = item.groups.find((group) => group.kind === 'direct' && group.items.length);
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
    const episodeGroup = item.groups.find((group) => group.kind === 'episodes' && group.ref);
    if (!episodeGroup?.ref) {
      setEpisodes([]);
      setActiveEpisode(undefined);
      setLoading(false);
      return () => controller.abort();
    }
    fetchEpisodes(item.providerId, episodeGroup.ref, controller.signal)
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
  }, [initialEpisodeRef, item]);

  useEffect(() => {
    if (!activeEpisode?.ref) return;
    const controller = new AbortController();
    const generation = ++generationRef.current;
    setLoading(true);
    setError(null);
    setSources([]);
    setSource(undefined);
    queueRef.current = undefined;
    fetchSources(item.providerId, activeEpisode.ref, item.kind, controller.signal)
      .then((result) => {
        if (controller.signal.aborted || generation !== generationRef.current) return;
        const ordered = orderSources(result);
        const queue = new SourceQueue(ordered);
        queueRef.current = queue;
        setSources(ordered);
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
    return () => {
      controller.abort();
      generationRef.current += 1;
    };
  }, [activeEpisode?.ref, item]);

  const selectEpisode = useCallback((episode: Episode) => {
    setActiveEpisode(episode);
  }, []);

  const selectSource = useCallback((sourceId: string) => {
    const selected = queueRef.current?.select(sourceId);
    if (selected) {
      setError(null);
      setSource(selected);
    }
  }, []);

  const sourceFailed = useCallback(() => {
    const next = queueRef.current?.failCurrent();
    if (next) {
      setSource(next);
      return;
    }
    setSource(undefined);
    setError('Every available source failed. Try another episode or try again later.');
  }, []);

  const ended = useCallback(() => {
    if (!activeEpisode) return;
    progress.clear(item.ref, activeEpisode.ref);
    const next = nextEpisode(
      episodes,
      episodes.findIndex((entry) => entry.id === activeEpisode.id),
      settings.autoAdvance,
    );
    if (next) {
      setActiveEpisode(next);
      onEpisodeChange?.(next);
    }
  }, [activeEpisode, episodes, item.ref, onEpisodeChange, progress.clear, settings.autoAdvance]);

  return {
    episodes,
    activeEpisode,
    sources,
    source,
    loading,
    error,
    progress,
    autoAdvance: settings.autoAdvance,
    selectEpisode,
    selectSource,
    sourceFailed,
    ended,
  };
}
