'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { useProgress, useSettings } from '@/lib/storage';
import type { StreamVariant } from '@/lib/streaming/types';
import type { Episode, Media } from '@/types/media';

interface PlaybackProgress {
  get: (ref: string, episodeRef?: string) => { position: number; duration: number } | undefined;
  save: (ref: string, episodeRef: string, position: number, duration: number) => void;
}

interface PlaybackSession {
  loading: boolean;
  error: string | null;
  variant: StreamVariant | null;
  allVariants: StreamVariant[];
  failedVariantIds: Set<string>;
  activeEpisode: Episode | null;
  episodes: Episode[];
  progress: PlaybackProgress;
  retry: () => void;
  selectEpisode: (episode: Episode) => void;
  selectVariant: (variantId: string) => void;
  variantFailed: (variantId: string) => void;
  ended: () => void;
}

type SessionAction =
  | { type: 'load-start' }
  | { type: 'load-episodes'; episodes: Episode[]; activeRef?: string }
  | { type: 'load-variants'; variants: StreamVariant[] }
  | { type: 'load-error'; message: string }
  | { type: 'select-episode'; episode: Episode }
  | { type: 'select-variant'; variantId: string }
  | { type: 'variant-failed'; variantId: string }
  | { type: 'retry' };

interface SessionState {
  loading: boolean;
  error: string | null;
  episodes: Episode[];
  activeEpisode: Episode | null;
  allVariants: StreamVariant[];
  failedVariantIds: Set<string>;
  selectedVariantId: string | null;
  generation: number;
}

function initialState(): SessionState {
  return {
    loading: true,
    error: null,
    episodes: [],
    activeEpisode: null,
    allVariants: [],
    failedVariantIds: new Set(),
    selectedVariantId: null,
    generation: 0,
  };
}

function pickVariant(state: SessionState): StreamVariant | null {
  if (state.selectedVariantId) {
    const found = state.allVariants.find((v) => v.variantId === state.selectedVariantId);
    if (found && !state.failedVariantIds.has(found.variantId)) return found;
  }
  return state.allVariants.find((v) => !state.failedVariantIds.has(v.variantId)) ?? null;
}

function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case 'load-start':
      return { ...state, loading: true, error: null };
    case 'load-episodes': {
      const activeEpisode = action.activeRef
        ? (action.episodes.find((ep) => ep.ref === action.activeRef) ?? action.episodes[0] ?? null)
        : (action.episodes[0] ?? null);
      return { ...state, episodes: action.episodes, activeEpisode };
    }
    case 'load-variants':
      return {
        ...state,
        loading: false,
        allVariants: action.variants,
        failedVariantIds: new Set(),
        selectedVariantId: null,
      };
    case 'load-error':
      return { ...state, loading: false, error: action.message };
    case 'select-episode':
      return {
        ...state,
        activeEpisode: action.episode,
        loading: true,
        error: null,
        allVariants: [],
        failedVariantIds: new Set(),
        selectedVariantId: null,
        generation: state.generation + 1,
      };
    case 'select-variant':
      return { ...state, selectedVariantId: action.variantId };
    case 'variant-failed':
      return {
        ...state,
        failedVariantIds: new Set([...state.failedVariantIds, action.variantId]),
      };
    case 'retry':
      return {
        ...state,
        loading: true,
        error: null,
        failedVariantIds: new Set(),
        selectedVariantId: null,
        generation: state.generation + 1,
      };
    default:
      return state;
  }
}

async function fetchEpisodes(item: Media, signal: AbortSignal): Promise<Episode[]> {
  const response = await fetch(
    `/api/episodes?provider=${encodeURIComponent(item.providerId)}&ref=${encodeURIComponent(item.ref)}`,
    { signal },
  );
  if (!response.ok) throw new Error('Failed to load episodes');
  return response.json();
}

async function fetchVariants(
  providerId: string,
  ref: string,
  kind: string,
  signal: AbortSignal,
): Promise<StreamVariant[]> {
  const response = await fetch(
    `/api/sources?provider=${encodeURIComponent(providerId)}&ref=${encodeURIComponent(ref)}&kind=${encodeURIComponent(kind)}`,
    { signal },
  );
  if (!response.ok) throw new Error('No playable source found');
  return response.json();
}

export function usePlaybackSession(
  item: Media,
  initialEpisodeRef: string | undefined,
  onEpisodeChange: (episode: Episode) => void,
): PlaybackSession {
  const [state, dispatch] = useReducer(sessionReducer, undefined, initialState);
  const mountedRef = useRef(true);
  const { settings } = useSettings();
  const progressStore = useProgress();
  const autoAdvance = settings.autoAdvance;

  // Fetch episodes on mount
  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();

    // For movies, create a single synthetic episode from the item
    if (item.kind === 'movie') {
      const first = item.groups.flatMap((g) => g.items)[0];
      const episode: Episode = first
        ? { id: first.id, title: first.label, ref: first.ref }
        : { id: item.id, title: item.title, ref: item.ref };
      dispatch({ type: 'load-episodes', episodes: [episode], activeRef: initialEpisodeRef });
    } else {
      // For series, resolve episodes from groups or fetch
      const direct = item.groups.find((g) => g.kind === 'direct' && g.items.length > 0);
      if (direct) {
        const episodes = direct.items.map((entry) => ({
          id: entry.id,
          title: entry.label,
          ref: entry.ref,
        }));
        dispatch({ type: 'load-episodes', episodes, activeRef: initialEpisodeRef });
      } else {
        const group = item.groups.find((g) => g.kind === 'episodes' && g.ref);
        if (group?.ref) {
          void (async () => {
            try {
              const episodes = await fetchEpisodes(item, controller.signal);
              if (mountedRef.current) {
                dispatch({ type: 'load-episodes', episodes, activeRef: initialEpisodeRef });
              }
            } catch {
              if (mountedRef.current) {
                dispatch({
                  type: 'load-episodes',
                  episodes: [{ id: item.id, title: item.title, ref: item.ref }],
                  activeRef: initialEpisodeRef,
                });
              }
            }
          })();
        } else {
          dispatch({
            type: 'load-episodes',
            episodes: [{ id: item.id, title: item.title, ref: item.ref }],
            activeRef: initialEpisodeRef,
          });
        }
      }
    }

    return () => {
      mountedRef.current = false;
      controller.abort();
    };
  }, [item, initialEpisodeRef]);

  // Fetch variants when activeEpisode changes
  const activeEpisode = state.activeEpisode;
  const _generation = state.generation;
  useEffect(() => {
    if (!activeEpisode) return;
    const controller = new AbortController();
    dispatch({ type: 'load-start' });

    void (async () => {
      try {
        const variants = await fetchVariants(
          item.providerId,
          activeEpisode.ref,
          item.kind,
          controller.signal,
        );
        if (mountedRef.current) {
          dispatch({ type: 'load-variants', variants });
        }
      } catch (error) {
        if (mountedRef.current && !controller.signal.aborted) {
          dispatch({
            type: 'load-error',
            message: error instanceof Error ? error.message : 'No playable source found',
          });
        }
      }
    })();

    return () => controller.abort();
    // generation triggers re-fetch on retry and episode change
  }, [item.providerId, item.kind, activeEpisode]);

  const variant = useMemo(() => pickVariant(state), [state]);

  const selectEpisode = useCallback(
    (episode: Episode) => {
      dispatch({ type: 'select-episode', episode });
      onEpisodeChange(episode);
    },
    [onEpisodeChange],
  );

  const selectVariant = useCallback((variantId: string) => {
    dispatch({ type: 'select-variant', variantId });
  }, []);

  const variantFailed = useCallback((variantId: string) => {
    dispatch({ type: 'variant-failed', variantId });
  }, []);

  const retry = useCallback(() => {
    dispatch({ type: 'retry' });
  }, []);

  const ended = useCallback(() => {
    if (!autoAdvance || !activeEpisode) return;
    const idx = state.episodes.findIndex((ep) => ep.id === activeEpisode.id);
    if (idx >= 0 && idx < state.episodes.length - 1) {
      const next = state.episodes[idx + 1];
      selectEpisode(next);
    }
  }, [autoAdvance, activeEpisode, state.episodes, selectEpisode]);

  const progress: PlaybackProgress = useMemo(
    () => ({
      get: (ref: string, episodeRef = '') => progressStore.get(item.providerId, ref, episodeRef),
      save: (ref: string, episodeRef: string, position: number, duration: number) =>
        progressStore.save(item.providerId, ref, episodeRef, position, duration, {
          title: item.displayTitle,
          poster: item.posterUrl,
          type: item.kind,
        }),
    }),
    [item.providerId, item.displayTitle, item.posterUrl, item.kind, progressStore],
  );

  return {
    loading: state.loading,
    error: state.error,
    variant,
    allVariants: state.allVariants,
    failedVariantIds: state.failedVariantIds,
    activeEpisode: state.activeEpisode,
    episodes: state.episodes,
    progress,
    retry,
    selectEpisode,
    selectVariant,
    variantFailed,
    ended,
  };
}
