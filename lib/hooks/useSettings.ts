'use client';

import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_PROVIDER_ID, isValidProvider } from '@/lib/api/providers';
import { PLAYBACK_RATES } from './usePlaybackRate';

// Lightweight persisted preferences for the web app, mirroring the Android
// app's `settingsStorage`. Kept in one localStorage object so "erase all
// local data" can wipe everything in one call.

const STORAGE_KEY = 'harustreams:settings';

export const THEMES = ['black', 'midnight', 'graphite', 'ocean'] as const;
export type Theme = (typeof THEMES)[number];

export type Settings = {
  defaultPlaybackRate: number;
  autoAdvance: boolean;
  excludedQualities: string[];
  provider: string;
  theme: Theme;
};

const DEFAULTS: Settings = {
  defaultPlaybackRate: 1,
  autoAdvance: true,
  excludedQualities: [],
  provider: DEFAULT_PROVIDER_ID,
  theme: 'black',
};

const ALL_QUALITIES = ['360p', '480p', '720p', '1080p', '2160p'];

function read(): Settings {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      defaultPlaybackRate: PLAYBACK_RATES.includes(parsed.defaultPlaybackRate ?? NaN)
        ? (parsed.defaultPlaybackRate as number)
        : DEFAULTS.defaultPlaybackRate,
      autoAdvance: parsed.autoAdvance ?? DEFAULTS.autoAdvance,
      excludedQualities: Array.isArray(parsed.excludedQualities)
        ? parsed.excludedQualities.filter((q) => ALL_QUALITIES.includes(q))
        : DEFAULTS.excludedQualities,
      provider: isValidProvider(parsed.provider) ? (parsed.provider as string) : DEFAULTS.provider,
      theme: THEMES.includes(parsed.theme as Theme) ? (parsed.theme as Theme) : DEFAULTS.theme,
    };
  } catch {
    return DEFAULTS;
  }
}

function write(next: Settings) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {}
}

export function useSettings() {
  // Start from DEFAULTS on both server and client so SSR and the first
  // client render match (no hydration error), then load the persisted
  // values once the app has mounted.
  const [settings, setSettings] = useState<Settings>(DEFAULTS);

  useEffect(() => {
    setSettings(read());
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      write(next);
      return next;
    });
  }, []);

  const toggleExcludedQuality = useCallback((quality: string) => {
    setSettings((prev) => {
      const next = {
        ...prev,
        excludedQualities: prev.excludedQualities.includes(quality)
          ? prev.excludedQualities.filter((q) => q !== quality)
          : [...prev.excludedQualities, quality],
      };
      write(next);
      return next;
    });
  }, []);

  return { settings, update, toggleExcludedQuality };
}

export { ALL_QUALITIES };
