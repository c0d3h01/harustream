import { z } from 'zod';
import type { SearchResult } from '@/types';

export const STORAGE_VERSION = 1;
export const STORAGE_NAMESPACE = 'harustream';

export const VALID_THEMES = ['black', 'midnight', 'graphite', 'ocean'] as const;
export type ValidTheme = (typeof VALID_THEMES)[number];
export const DEFAULT_THEME: ValidTheme = 'graphite';

/** Cookie that mirrors the chosen theme so the server can render
 *  <html data-theme> without a pre-paint inline script. */
export const THEME_COOKIE = 'harustream.theme';

export const settingsSchema = z.object({
  version: z.literal(STORAGE_VERSION),
  defaultPlaybackRate: z.number().finite(),
  autoAdvance: z.boolean(),
  excludedQualities: z.array(z.string()),
  provider: z.string(),
  theme: z.enum(VALID_THEMES),
});

export const libraryItemSchema = z.object({
  id: z.string(),
  providerId: z.string(),
  providerName: z.string(),
  title: z.string(),
  displayTitle: z.string(),
  posterUrl: z.string().optional(),
  ref: z.string(),
});

export const librarySchema = z.object({
  version: z.literal(STORAGE_VERSION),
  items: z.array(libraryItemSchema),
});

export const progressEntrySchema = z.object({
  position: z.number().finite().nonnegative(),
  duration: z.number().finite().positive(),
  updatedAt: z.number().int().positive(),
  title: z.string().optional(),
  poster: z.string().optional(),
  type: z.string().optional(),
  episodeTitle: z.string().optional(),
  provider: z.string().optional(),
});

export const progressSchema = z.object({
  version: z.literal(STORAGE_VERSION),
  entries: z.record(progressEntrySchema),
});

export type StoredProgressEntry = z.infer<typeof progressEntrySchema>;
export type StoredSettings = z.infer<typeof settingsSchema>;
export type StoredLibrary = z.infer<typeof librarySchema>;
export type StoredProgress = z.infer<typeof progressSchema>;
export type LibraryMedia = Pick<
  SearchResult,
  'id' | 'providerId' | 'providerName' | 'title' | 'posterUrl' | 'ref'
>;

export const DEFAULT_SETTINGS: StoredSettings = {
  version: STORAGE_VERSION,
  defaultPlaybackRate: 1,
  autoAdvance: true,
  excludedQualities: [],
  provider: 'movieBoxWeb',
  theme: DEFAULT_THEME,
};
export const DEFAULT_LIBRARY: StoredLibrary = { version: STORAGE_VERSION, items: [] };
export const DEFAULT_PROGRESS: StoredProgress = { version: STORAGE_VERSION, entries: {} };

export function storageKey(kind: string, scope?: string): string {
  return [STORAGE_NAMESPACE, kind, scope].filter(Boolean).join(':');
}

export function readStorage<T>(
  key: string,
  schema: z.ZodType<T>,
  fallback: T,
  storage: Storage | undefined = typeof window === 'undefined' ? undefined : window.localStorage,
): T {
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(key);
    if (!raw) return fallback;
    return schema.parse(JSON.parse(raw));
  } catch {
    return fallback;
  }
}

export function writeStorage<T>(
  key: string,
  value: T,
  storage: Storage | undefined = typeof window === 'undefined' ? undefined : window.localStorage,
): void {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    // Persistence is best effort when browser storage is unavailable.
  }
}
