import { encodeBase64Url } from './base64url';

export interface TmdbContext {
  kind: 'movie' | 'tv';
  id: number;
}

/** Provider refs can be long, signed URLs — keep them out of the visible path. */
export function titleHref(providerId: string, ref: string): string {
  return `/title/${encodeURIComponent(providerId)}/${encodeBase64Url(ref)}`;
}

export function watchHref(providerId: string, ref: string, episodeRef?: string): string {
  const base = `/watch/${encodeURIComponent(providerId)}/${encodeBase64Url(ref)}`;
  return episodeRef ? `${base}?episode=${encodeURIComponent(episodeRef)}` : base;
}

export function tmdbPath(kind: TmdbContext['kind'], id: number): string {
  return `/${kind}/${id}`;
}
