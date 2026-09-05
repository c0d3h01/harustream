// TMDB image URL builder. Returns *upstream* `image.tmdb.org` URLs —
// callers pass them through the existing `imageUrl()` helper so every
// <Image> keeps loading via the SSRF-guarded same-origin `/api/image`
// proxy (no next.config CDN allowlist needed).

const IMAGE_BASE = 'https://image.tmdb.org/t/p';

export type TmdbPosterSize = 'w342' | 'w500';
export type TmdbBackdropSize = 'w780' | 'w1280';
export type TmdbProfileSize = 'w185';
export type TmdbLogoSize = 'w185' | 'w500';

/** Upstream TMDB image URL, or undefined when the path is missing. */
export function tmdbImageUrl(
  path: string | null | undefined,
  size: TmdbPosterSize | TmdbBackdropSize | TmdbProfileSize | TmdbLogoSize,
): string | undefined {
  if (!path) return undefined;
  return `${IMAGE_BASE}/${size}${path}`;
}

/** YouTube thumbnail for a trailer key (proxied via `imageUrl()` by callers). */
export function youtubeThumbnail(key: string): string {
  return `https://i.ytimg.com/vi/${key}/hqdefault.jpg`;
}

/** Privacy-enhanced YouTube embed, loaded only after an explicit tap. */
export function youtubeEmbedUrl(key: string): string {
  return `https://www.youtube-nocookie.com/embed/${key}?rel=0`;
}
