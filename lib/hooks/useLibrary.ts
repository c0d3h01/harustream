'use client';

import { useCallback, useSyncExternalStore } from 'react';
import type { Media } from '@/lib/api/client';
import { DEFAULT_PROVIDER_ID } from '@/lib/api/providers';

const STORAGE_PREFIX = 'harustreams:library';

type Listener = () => void;
const listeners = new Set<Listener>();
let cachedKey: string | null = null;
let cachedValue: Media[] = [];
const EMPTY: Media[] = [];

function storageKey(provider: string) {
  return `${STORAGE_PREFIX}:${provider}`;
}

function getSnapshot(provider: string): Media[] {
  if (typeof window === 'undefined') return EMPTY;
  const raw = window.localStorage.getItem(storageKey(provider));
  // Memoize by provider + raw string. As long as the stored bytes haven't
  // changed, return the same array reference so useSyncExternalStore doesn't
  // trigger an infinite re-render. Provider is part of the cache key so
  // switching providers never serves another provider's snapshot.
  const key = `${provider}::${raw}`;
  if (key === cachedKey) return cachedValue;
  cachedKey = key;
  if (!raw) {
    cachedValue = EMPTY;
    return cachedValue;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    cachedValue = Array.isArray(parsed) ? (parsed as Media[]) : EMPTY;
  } catch {
    cachedValue = EMPTY;
  }
  return cachedValue;
}

function writeStorage(provider: string, next: Media[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(provider), JSON.stringify(next));
  } catch {}
  // Invalidate the cache before notifying so listeners re-read fresh.
  cachedKey = null;
  for (const listener of listeners) listener();
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useLibrary(provider: string = DEFAULT_PROVIDER_ID) {
  const items = useSyncExternalStore(
    subscribe,
    () => getSnapshot(provider),
    () => EMPTY,
  );

  const toggle = useCallback(
    (item: Media) => {
      if (typeof window === 'undefined') return;
      const current = getSnapshot(provider);
      const next = current.some((x) => x.link === item.link)
        ? current.filter((x) => x.link !== item.link)
        : [...current, item];
      writeStorage(provider, next);
    },
    [provider],
  );

  const has = useCallback((link: string) => items.some((x) => x.link === link), [items]);

  return { items, toggle, has };
}
