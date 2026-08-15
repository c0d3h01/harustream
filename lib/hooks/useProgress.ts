'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { DEFAULT_PROVIDER_ID } from '@/lib/api/providers';

// Persist playback position per (item link, episode) so users can resume
// where they left off across sessions. Records are scoped per provider so
// switching providers never surfaces another provider's links.

const STORAGE_PREFIX = 'harustreams:progress';

type Entry = {
  position: number;
  duration: number;
  updatedAt: number;
  title?: string;
  poster?: string;
  type?: string;
  episodeTitle?: string;
};

// Metadata attached to a progress record so the Continue-watching rail can
// render a title/poster without re-fetching the catalog.
export type ProgressMeta = {
  title?: string;
  poster?: string;
  type?: string;
  episodeTitle?: string;
};

type Listener = () => void;
const listeners = new Set<Listener>();
let cachedKey: string | null = null;
let cachedValue: Record<string, Entry> = {};

function storageKey(provider: string) {
  return `${STORAGE_PREFIX}:${provider}`;
}

function key(link: string, episode: string) {
  return `${link}::${episode}`;
}

function readAll(provider: string): Record<string, Entry> {
  if (typeof window === 'undefined') return cachedValue;
  const raw = window.localStorage.getItem(storageKey(provider));
  const cacheKey = `${provider}::${raw}`;
  if (cacheKey === cachedKey) return cachedValue;
  cachedKey = cacheKey;
  if (!raw) {
    cachedValue = {};
    return cachedValue;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    cachedValue =
      parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, Entry>)
        : {};
  } catch {
    cachedValue = {};
  }
  return cachedValue;
}

function writeAll(provider: string, next: Record<string, Entry>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(provider), JSON.stringify(next));
  } catch {}
  cachedKey = null;
  for (const l of listeners) l();
}

function subscribe(l: Listener) {
  listeners.add(l);
  // Cross-tab sync: when another tab writes progress (or the user has two
  // windows open), re-read from localStorage so both stay in lockstep.
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', onStorage);
  }
  return () => {
    listeners.delete(l);
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', onStorage);
    }
  };
}

function onStorage(e: StorageEvent) {
  if (e.key === null || e.key?.startsWith(STORAGE_PREFIX)) {
    cachedKey = null;
    for (const l of listeners) l();
  }
}

export function useProgress(provider: string = DEFAULT_PROVIDER_ID) {
  const data = useSyncExternalStore(
    subscribe,
    () => readAll(provider),
    () => cachedValue,
  );

  const get = useCallback(
    (link: string, episode: string): Entry | undefined => data[key(link, episode)],
    [data],
  );

  const save = useCallback(
    (link: string, episode: string, position: number, duration: number, meta?: ProgressMeta) => {
      if (!Number.isFinite(position) || !Number.isFinite(duration)) return;
      // Don't store near-the-start or near-the-end positions — those are
      // navigation, not real progress.
      if (position < 1 || duration - position < 5) return;
      const current = readAll(provider);
      const existing = current[key(link, episode)];
      writeAll(provider, {
        ...current,
        [key(link, episode)]: {
          position,
          duration,
          updatedAt: Date.now(),
          title: meta?.title ?? existing?.title,
          poster: meta?.poster ?? existing?.poster,
          type: meta?.type ?? existing?.type,
          episodeTitle: meta?.episodeTitle ?? existing?.episodeTitle,
        },
      });
    },
    [provider],
  );

  const clear = useCallback(
    (link: string, episode: string) => {
      const current = readAll(provider);
      const { [key(link, episode)]: _drop, ...rest } = current;
      void _drop;
      writeAll(provider, rest);
    },
    [provider],
  );

  // Continue-watching feed: entries with meaningful progress (not nearly
  // finished), newest first, one record per title.
  const list = useCallback(
    () =>
      Object.entries(data)
        .map(([k, entry]) => ({
          link: k.split('::')[0],
          episode: k.split('::').slice(1).join('::'),
          ...entry,
        }))
        .filter((entry) => {
          if (!entry.duration || entry.duration <= 0) return false;
          const pct = entry.position / entry.duration;
          // Skip < 1% (barely started) and > 95% (practically done).
          return pct >= 0.01 && pct <= 0.95;
        })
        // One entry per title, preferring the most recent episode.
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .filter((entry, i, all) => all.findIndex((e) => e.link === entry.link) === i)
        .slice(0, 20),
    [data],
  );

  return { get, save, clear, list };
}
