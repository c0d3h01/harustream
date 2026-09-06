'use client';

// Orchestrates episode + variant resolution for one watch session. There is
// no automatic source queue here — the previous implementation's
// `SourceQueue` kept a module-level, cross-user "failed sources" map and
// silently advanced to the next provider/quality on error. Both are gone:
// `failedVariantIds` is component-instance state (one playback session,
// never shared), and it only ever informs the SourceSelector's UI — nothing
// reads it to pick a variant automatically. Switching is always the user
// clicking a row in the SourceSelector.
import { useCallback, useEffect, useRef, useState } from 'react';
import { episodes as fetchEpisodes, sources as fetchSources } from '@/lib/api/client';
import { useProgress, useSettings } from '@/lib/storage';
import type { Episode, Media, StreamVariant } from '@/types';
import type { PlayerErrorInfo } from './types';

export interface PlaybackSession {
  activeEpisode: Episode | undefined;
  variant: StreamVariant | undefined;
  episodes: Episode[];
  allVariants: readonly StreamVariant[];
  failedVariantIds: ReadonlySet<string>;
  loading: boolean;
  error: string | null;
  progress: ReturnType<typeof useProgress>;
  variantFailed: (variantId: string, error: PlayerErrorInfo) => void;
  ended: () => void;
  retry: () => void;
  selectEpisode: (episode: Episode) => void;
  selectVariant: (variantId: string) => void;
}

export function usePlaybackSession(
  item: Media,
  initialEpisodeRef?: string,
  onEpisodeChange?: (episode: Episode) => void,
): PlaybackSession {
  const progress = useProgress(item.providerId);
  const { settings } = useSettings();
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [activeEpisode, setActiveEpisode] = useState<Episode>();
  const [allVariants, setAllVariants] = useState<readonly StreamVariant[]>([]);
  const [activeVariantId, setActiveVariantId] = useState<string>();
  const [failedVariantIds, setFailedVariantIds] = useState<ReadonlySet<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generationRef = useRef(0);
  const [variantsNonce, setVariantsNonce] = useState(0);

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

  // biome-ignore lint/correctness/useExhaustiveDependencies: retry() bumps variantsNonce to force a re-fetch
  useEffect(() => {
    if (!activeEpisode?.ref) return;
    const episodeRef = activeEpisode.ref;
    const controller = new AbortController();
    const generation = ++generationRef.current;
    setLoading(true);
    setError(null);
    setAllVariants([]);
    setActiveVariantId(undefined);
    setFailedVariantIds(new Set());
    fetchSources(providerId, episodeRef, itemKind, controller.signal)
      .then((result) => {
        if (controller.signal.aborted || generation !== generationRef.current) return;
        setAllVariants(result);
        setActiveVariantId(result[0]?.variantId);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted && generation === generationRef.current) {
          setError(reason instanceof Error ? reason.message : 'Sources could not be loaded');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted && generation === generationRef.current) setLoading(false);
      });
    return () => controller.abort();
  }, [activeEpisode?.ref, providerId, itemKind, variantsNonce]);

  // Warm the variant cache for the next episode so auto-advance starts fast.
  useEffect(() => {
    if (itemKind === 'movie' || !settings.autoAdvance || episodes.length < 2) return;
    const index = activeEpisode ? episodes.findIndex((entry) => entry.id === activeEpisode.id) : -1;
    const next = index >= 0 ? episodes[index + 1] : undefined;
    if (!next?.ref) return;
    const controller = new AbortController();
    fetchSources(providerId, next.ref, itemKind, controller.signal).catch(() => {});
    return () => controller.abort();
  }, [activeEpisode, episodes, itemKind, providerId, settings.autoAdvance]);

  const variantFailed = useCallback((variantId: string, _error: PlayerErrorInfo) => {
    setFailedVariantIds((prev) => {
      if (prev.has(variantId)) return prev;
      const next = new Set(prev);
      next.add(variantId);
      return next;
    });
  }, []);

  const retry = useCallback(() => {
    setError(null);
    setFailedVariantIds(new Set());
    setAllVariants([]);
    setActiveVariantId(undefined);
    setVariantsNonce((nonce) => nonce + 1);
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

  const selectVariant = useCallback((variantId: string) => setActiveVariantId(variantId), []);

  return {
    activeEpisode,
    variant: allVariants.find((entry) => entry.variantId === activeVariantId),
    episodes,
    allVariants,
    failedVariantIds,
    loading,
    error,
    progress,
    variantFailed,
    ended,
    retry,
    selectEpisode,
    selectVariant,
  };
}
