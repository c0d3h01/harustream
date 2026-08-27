'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Media, SearchResult } from '@/types';
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
  THEME_COOKIE,
  VALID_THEMES,
  writeStorage,
} from './schema';

export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
export const ALL_QUALITIES = ['360p', '480p', '720p', '1080p', '2160p'] as const;
export const THEMES = VALID_THEMES;
export type Theme = (typeof THEMES)[number];

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
  const toggleExcludedQuality = useCallback(
    (quality: string) =>
      update({
        excludedQualities: settings.excludedQualities.includes(quality)
          ? settings.excludedQualities.filter((item) => item !== quality)
          : [...settings.excludedQualities, quality],
      }),
    [settings.excludedQualities, update],
  );
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    // Mirror the choice into a cookie so the server renders <html data-theme>
    // on the next request — no pre-paint script, no theme flash on reload.
    // biome-ignore lint/suspicious/noDocumentCookie: document.cookie is synchronous and universal; the async Cookie Store API is not (Safari/Firefox support gaps).
    document.cookie = `${THEME_COOKIE}=${settings.theme}; max-age=31536000; path=/`;
  }, [settings.theme]);
  return { settings, update, toggleExcludedQuality };
}

export function useLibrary(providerId = '') {
  const [stored, setStored] = useStoredValue(
    storageKey('library', providerId),
    librarySchema,
    DEFAULT_LIBRARY,
  );
  const items = stored.items;
  const toggle = useCallback(
    (item: Media | SearchResult) => {
      const libraryItem: SearchResult = {
        id: item.id,
        providerId: item.providerId,
        providerName: 'providerName' in item ? item.providerName : item.providerId,
        title: item.title,
        displayTitle: item.displayTitle,
        posterUrl: item.posterUrl,
        ref: item.ref,
      };
      const next = items.some((entry) => entry.ref === item.ref)
        ? items.filter((entry) => entry.ref !== item.ref)
        : [...items, libraryItem];
      setStored({ version: 1, items: next });
    },
    [items, setStored],
  );
  const has = useCallback((ref: string) => items.some((item) => item.ref === ref), [items]);
  return { items, toggle, has };
}

export function useProgress(providerId = '') {
  const [stored, setStored] = useStoredValue(
    storageKey('progress', providerId),
    progressSchema,
    DEFAULT_PROGRESS,
  );
  const get = useCallback(
    (ref: string, episodeRef = ''): StoredProgressEntry | undefined =>
      stored.entries[`${ref}::${episodeRef}`],
    [stored.entries],
  );
  const save = useCallback(
    (
      ref: string,
      episodeRef: string,
      position: number,
      duration: number,
      meta?: Omit<StoredProgressEntry, 'position' | 'duration' | 'updatedAt'>,
    ) => {
      if (
        !Number.isFinite(position) ||
        !Number.isFinite(duration) ||
        position < 1 ||
        duration - position < 5
      ) {
        return;
      }
      const key = `${ref}::${episodeRef}`;
      setStored((current) => ({
        version: 1,
        entries: {
          ...current.entries,
          [key]: { ...meta, position, duration, updatedAt: Date.now() },
        },
      }));
    },
    [setStored],
  );
  const clear = useCallback(
    (ref: string, episodeRef: string) => {
      const { [`${ref}::${episodeRef}`]: _removed, ...entries } = stored.entries;
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
