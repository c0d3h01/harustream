'use client';

import { useCallback, useState } from 'react';

// Persist the user's chosen playback speed across sessions so it survives
// reloads and applies to the next title played.

const STORAGE_KEY = 'harustream:playbackRate';

export const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

function readStored(fallback: number): number {
  if (typeof window === 'undefined') return fallback;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  const value = raw ? Number(raw) : fallback;
  return PLAYBACK_RATES.includes(value) ? value : fallback;
}

export function usePlaybackRate(preferredDefault = 1) {
  const [rate, setRateState] = useState<number>(() =>
    typeof window === 'undefined' ? preferredDefault : readStored(preferredDefault),
  );

  const setRate = useCallback((next: number) => {
    setRateState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(next));
    } catch {}
  }, []);

  return { rate, setRate };
}
