'use client';

import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_PROVIDER_ID } from '@/lib/api/providers';

// Recent-search history persisted in localStorage, mirroring the Android
// app's MMKV-backed `searchHistory`. Newest first, capped. Scoped per
// provider so each provider keeps its own query history.

const STORAGE_PREFIX = 'harustreams:searchHistory';
const MAX = 12;

function storageKey(provider: string) {
  return `${STORAGE_PREFIX}:${provider}`;
}

function readAll(provider: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(storageKey(provider));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeAll(provider: string, items: string[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(provider), JSON.stringify(items.slice(0, MAX)));
  } catch {}
}

export function useSearchHistory(provider: string = DEFAULT_PROVIDER_ID) {
  const [items, setItems] = useState<string[]>([]);

  // Read persisted history after mount (avoids SSR/client hydration
  // mismatch) and whenever the active provider changes.
  useEffect(() => {
    setItems(readAll(provider));
  }, [provider]);

  const add = useCallback(
    (query: string) => {
      const trimmed = query.trim();
      if (!trimmed) return;
      setItems((prev) => {
        const next = [trimmed, ...prev.filter((x) => x !== trimmed)].slice(0, MAX);
        writeAll(provider, next);
        return next;
      });
    },
    [provider],
  );

  const remove = useCallback(
    (query: string) => {
      setItems((prev) => {
        const next = prev.filter((x) => x !== query);
        writeAll(provider, next);
        return next;
      });
    },
    [provider],
  );

  const clear = useCallback(() => {
    setItems([]);
    writeAll(provider, []);
  }, [provider]);

  return { items, add, remove, clear };
}
