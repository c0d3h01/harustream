const IMAGE_BASE = 'https://image.tmdb.org/t/p';

export function tmdbImageUrl(path: string | null | undefined, size: string): string | undefined {
  if (!path) return undefined;
  return `${IMAGE_BASE}/${size}${path}`;
}
