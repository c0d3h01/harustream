'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Media, SearchResult } from '@/types/media';
import {
  DEFAULT_LIBRARY,
  DEFAULT_PROGRESS,
  DEFAULT_SETTINGS,
  librarySchema,
  progressSchema,
  readStorage,
  type StoredProgressEntry,
  type StoredSettings,
  settingsSchema,
  storageKey,
  type TmdbContext,
  writeStorage,
} from './schema';

function useStoredValue<T>(
  key: string,
  schema: Parameters<typeof readStorage<T>>[1],
  fallback: T,
): [T, (next: T | ((current: T) => T)) => void] {
  const [value, setValue] = useState(fallback);
  const valueRef = useRef(value);
  useEffect(() => {
    const next = readStorage(key, schema, fallback);
    valueRef.current = next;
    setValue(next);
  }, [key, schema, fallback]);
  const update = useCallback(
    (nextOrUpdater: T | ((current: T) => T)) => {
      const next =
        typeof nextOrUpdater === 'function'
          ? (nextOrUpdater as (current: T) => T)(valueRef.current)
          : nextOrUpdater;
      valueRef.current = next;
      setValue(next);
      writeStorage(key, next);
    },
    [key],
  );
  return [value, update];
}

export function useSettings() {
  const [settings, setSettings] = useStoredValue(
    storageKey('settings'),
    settingsSchema,
    DEFAULT_SETTINGS,
  );
  const update = useCallback(
    (patch: Partial<StoredSettings>) => setSettings({ ...settings, ...patch }),
    [settings, setSettings],
  );

  return { settings, update };
}

export function useLibrary(scope?: string) {
  const [stored, setStored] = useStoredValue(
    storageKey('library', scope),
    librarySchema,
    DEFAULT_LIBRARY,
  );
  const items = stored.items;
  const toggle = useCallback(
    (item: (Media | SearchResult) & Partial<TmdbContext>) => {
      const libraryItem: SearchResult & TmdbContext = {
        id: item.id,
        providerId: item.providerId,
        providerName: 'providerName' in item ? item.providerName : item.providerId,
        title: item.title,
        displayTitle: item.displayTitle,
        posterUrl: item.posterUrl,
        ref: item.ref,
        ...(item.tmdbKind ? { tmdbKind: item.tmdbKind } : {}),
        ...(item.tmdbId ? { tmdbId: item.tmdbId } : {}),
        ...(item.tmdbTitle ? { tmdbTitle: item.tmdbTitle } : {}),
        ...(item.tmdbPoster ? { tmdbPoster: item.tmdbPoster } : {}),
      };
      const key = `${item.providerId}:${item.ref}`;
      const next = items.some((entry) => `${entry.providerId}:${entry.ref}` === key)
        ? items.filter((entry) => `${entry.providerId}:${entry.ref}` !== key)
        : [...items, libraryItem];
      setStored({ version: 1, items: next });
    },
    [items, setStored],
  );
  const has = useCallback(
    (a: string, b?: string) => {
      const providerId = b ? a : scope;
      const ref = b ? b : a;
      return items.some((item) => item.providerId === providerId && item.ref === ref);
    },
    [items, scope],
  );
  return { items, toggle, has };
}

function progressKey(providerId: string, ref: string, episodeRef: string): string {
  return `${providerId}:${ref}::${episodeRef}`;
}

export function useProgress(scope?: string) {
  const [stored, setStored] = useStoredValue(
    storageKey('progress', scope),
    progressSchema,
    DEFAULT_PROGRESS,
  );
  const get = useCallback(
    (providerId: string, ref: string, episodeRef = ''): StoredProgressEntry | undefined =>
      stored.entries[progressKey(providerId, ref, episodeRef)],
    [stored.entries],
  );
  const save = useCallback(
    (
      providerId: string,
      ref: string,
      episodeRef: string,
      position: number,
      duration: number,
      meta?: Omit<StoredProgressEntry, 'position' | 'duration' | 'updatedAt' | 'provider'>,
    ) => {
      if (
        !Number.isFinite(position) ||
        !Number.isFinite(duration) ||
        position < 1 ||
        duration - position < 5
      ) {
        return;
      }
      const key = progressKey(providerId, ref, episodeRef);
      setStored((current) => ({
        version: 1,
        entries: {
          ...current.entries,
          [key]: { ...meta, provider: providerId, position, duration, updatedAt: Date.now() },
        },
      }));
    },
    [setStored],
  );
  const clear = useCallback(
    (providerId: string, ref: string, episodeRef: string) => {
      const { [progressKey(providerId, ref, episodeRef)]: _removed, ...entries } = stored.entries;
      setStored({ version: 1, entries });
    },
    [setStored, stored.entries],
  );
  const clearAll = useCallback(() => {
    setStored({ version: 1, entries: {} });
  }, [setStored]);
  const list = useMemo(
    () =>
      Object.entries(stored.entries)
        .map(([key, entry]) => {
          const separator = key.indexOf('::');
          return { ref: key.slice(0, separator), episodeRef: key.slice(separator + 2), ...entry };
        })
        .filter(
          (entry) =>
            entry.position / entry.duration >= 0.01 && entry.position / entry.duration <= 0.95,
        )
        .sort((left, right) => right.updatedAt - left.updatedAt),
    [stored.entries],
  );
  return { get, save, clear, clearAll, list };
}
