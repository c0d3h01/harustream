const STORAGE_VERSION = 1;
const STORAGE_NAMESPACE = 'harustream';

export interface TmdbContext {
  tmdbKind?: 'movie' | 'tv';
  tmdbId?: number;
  tmdbTitle?: string;
  tmdbPoster?: string;
}

export interface StoredSettings {
  version: 1;
  autoAdvance: boolean;
  provider?: string;
}

export interface LibraryItem extends TmdbContext {
  id: string;
  providerId: string;
  providerName: string;
  title: string;
  displayTitle: string;
  posterUrl?: string;
  ref: string;
}

interface StoredLibrary {
  version: 1;
  items: LibraryItem[];
}

export interface StoredProgressEntry extends TmdbContext {
  position: number;
  duration: number;
  updatedAt: number;
  title?: string;
  poster?: string;
  type?: string;
  episodeTitle?: string;
  provider: string;
}

interface StoredProgress {
  version: 1;
  entries: Record<string, StoredProgressEntry>;
}

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw);
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function parseTmdbContext(raw: Record<string, unknown>): TmdbContext | null {
  const { tmdbKind, tmdbId, tmdbTitle, tmdbPoster } = raw;
  if (tmdbKind !== undefined && tmdbKind !== 'movie' && tmdbKind !== 'tv') {
    return null;
  }
  if (
    tmdbId !== undefined &&
    (typeof tmdbId !== 'number' || !Number.isInteger(tmdbId) || tmdbId <= 0)
  ) {
    return null;
  }
  if (!isOptionalString(tmdbTitle) || !isOptionalString(tmdbPoster)) {
    return null;
  }
  const out: TmdbContext = {};
  if (tmdbKind === 'movie' || tmdbKind === 'tv') out.tmdbKind = tmdbKind;
  if (typeof tmdbId === 'number') out.tmdbId = tmdbId;
  if (typeof tmdbTitle === 'string') out.tmdbTitle = tmdbTitle;
  if (typeof tmdbPoster === 'string') out.tmdbPoster = tmdbPoster;
  return out;
}

export function parseSettings(raw: unknown): StoredSettings | null {
  if (!isRecord(raw)) return null;
  if (raw.version !== STORAGE_VERSION) return null;
  if (typeof raw.autoAdvance !== 'boolean') return null;
  if (!isOptionalString(raw.provider)) return null;
  const out: StoredSettings = { version: STORAGE_VERSION, autoAdvance: raw.autoAdvance };
  if (typeof raw.provider === 'string') out.provider = raw.provider;
  return out;
}

function parseLibraryItem(raw: unknown): LibraryItem | null {
  if (!isRecord(raw)) return null;
  const { id, providerId, providerName, title, displayTitle, posterUrl, ref } = raw;
  if (
    typeof id !== 'string' ||
    typeof providerId !== 'string' ||
    typeof providerName !== 'string' ||
    typeof title !== 'string' ||
    typeof displayTitle !== 'string' ||
    typeof ref !== 'string'
  ) {
    return null;
  }
  if (!isOptionalString(posterUrl)) return null;
  const tmdb = parseTmdbContext(raw);
  if (!tmdb) return null;
  const out: LibraryItem = {
    id,
    providerId,
    providerName,
    title,
    displayTitle,
    ref,
    ...tmdb,
  };
  if (typeof posterUrl === 'string') out.posterUrl = posterUrl;
  return out;
}

export function parseLibrary(raw: unknown): StoredLibrary | null {
  if (!isRecord(raw)) return null;
  if (raw.version !== STORAGE_VERSION) return null;
  if (!Array.isArray(raw.items)) return null;
  const items: LibraryItem[] = [];
  for (const entry of raw.items) {
    const parsed = parseLibraryItem(entry);
    if (!parsed) return null;
    items.push(parsed);
  }
  return { version: STORAGE_VERSION, items };
}

function parseProgressEntry(raw: unknown): StoredProgressEntry | null {
  if (!isRecord(raw)) return null;
  const { position, duration, updatedAt, title, poster, type, episodeTitle, provider } = raw;
  if (typeof position !== 'number' || !Number.isFinite(position) || position < 0) return null;
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0) return null;
  if (typeof updatedAt !== 'number' || !Number.isInteger(updatedAt) || updatedAt <= 0) return null;
  if (typeof provider !== 'string' || provider.length < 1) return null;
  if (
    !isOptionalString(title) ||
    !isOptionalString(poster) ||
    !isOptionalString(type) ||
    !isOptionalString(episodeTitle)
  ) {
    return null;
  }
  const tmdb = parseTmdbContext(raw);
  if (!tmdb) return null;
  const out: StoredProgressEntry = {
    ...tmdb,
    position,
    duration,
    updatedAt,
    provider,
  };
  if (typeof title === 'string') out.title = title;
  if (typeof poster === 'string') out.poster = poster;
  if (typeof type === 'string') out.type = type;
  if (typeof episodeTitle === 'string') out.episodeTitle = episodeTitle;
  return out;
}

export function parseProgress(raw: unknown): StoredProgress | null {
  if (!isRecord(raw)) return null;
  if (raw.version !== STORAGE_VERSION) return null;
  if (!isRecord(raw.entries)) return null;
  const entries: Record<string, StoredProgressEntry> = {};
  for (const [key, value] of Object.entries(raw.entries)) {
    const parsed = parseProgressEntry(value);
    if (!parsed) return null;
    entries[key] = parsed;
  }
  return { version: STORAGE_VERSION, entries };
}

export const DEFAULT_SETTINGS: StoredSettings = {
  version: STORAGE_VERSION,
  autoAdvance: true,
  provider: undefined,
};
export const DEFAULT_LIBRARY: StoredLibrary = { version: STORAGE_VERSION, items: [] };
export const DEFAULT_PROGRESS: StoredProgress = { version: STORAGE_VERSION, entries: {} };

export function storageKey(kind: string, scope?: string): string {
  return [STORAGE_NAMESPACE, kind, scope].filter(Boolean).join(':');
}

export function readStorage<T>(
  key: string,
  parse: (raw: unknown) => T | null,
  fallback: T,
  storage: Storage | undefined = typeof window === 'undefined' ? undefined : window.localStorage,
): T {
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(key);
    if (!raw) return fallback;
    return parse(JSON.parse(raw)) ?? fallback;
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
  } catch {}
}
