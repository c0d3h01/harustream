'use client';

import { useCallback, useEffect, useState } from 'react';
import { PLAYBACK_RATES } from './usePlaybackRate';

// Lightweight persisted preferences for the web app, mirroring the Android
// app's `settingsStorage`. Kept in one localStorage object so "erase all
// local data" can wipe everything in one call.

const STORAGE_KEY = 'harustream:settings';

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
  // The provider is resolved from the live API list at runtime (see
  // useProviders); an empty default means "let the app pick the first
  // available provider once the list loads".
  provider: '',
  theme: 'graphite',
};

const ALL_QUALITIES = ['360p', '480p', '720p', '1080p', '2160p'];

// Storage-only field: set once when the old default theme ('black') has been
// migrated to the current default ('graphite'). Without it, a deliberate
// re-selection of black would be re-migrated on the next reload.
type StoredSettings = Partial<Settings> & { themeMigrated?: boolean };

function read(): Settings {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as StoredSettings;
    const storedTheme = THEMES.includes(parsed.theme as Theme)
      ? (parsed.theme as Theme)
      : DEFAULTS.theme;
    // 'black' predates graphite as the default, and unrelated setting writes
    // (e.g. the provider auto-correct in App) persist the whole object — so
    // most stored values carry the old default. Treat it as the current
    // default once, then flag the migration so explicit choices stick.
    const theme = storedTheme === 'black' && !parsed.themeMigrated ? 'graphite' : storedTheme;
    if (theme !== storedTheme) {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ ...parsed, theme, themeMigrated: true }),
      );
    }
    return {
      defaultPlaybackRate: PLAYBACK_RATES.includes(parsed.defaultPlaybackRate ?? NaN)
        ? (parsed.defaultPlaybackRate as number)
        : DEFAULTS.defaultPlaybackRate,
      autoAdvance: parsed.autoAdvance ?? DEFAULTS.autoAdvance,
      excludedQualities: Array.isArray(parsed.excludedQualities)
        ? parsed.excludedQualities.filter((q) => ALL_QUALITIES.includes(q))
        : DEFAULTS.excludedQualities,
      // The persisted provider id is kept verbatim — the live list decides
      // whether it is still usable (see App's auto-correct effect).
      provider: typeof parsed.provider === 'string' ? (parsed.provider as string) : '',
      theme,
    };
  } catch {
    return DEFAULTS;
  }
}

function write(next: Settings) {
  if (typeof window === 'undefined') return;
  try {
    // Merge over the previous object so storage-only fields (themeMigrated)
    // survive unrelated updates.
    const prev = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}') as StoredSettings;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...prev, ...next }));
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
