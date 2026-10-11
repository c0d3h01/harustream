import type { TmdbContext } from '@/lib/storage/schema';
import type { TmdbKind } from '@/tmdb/catalog';
import type { SearchResult } from '@/types/media';

export function tmdbSaveItem(
  kind: TmdbKind,
  tmdbId: number,
  title: string,
  posterPath?: string,
): SearchResult & TmdbContext {
  return {
    id: `tmdb:${kind}:${tmdbId}`,
    providerId: 'tmdb',
    providerName: 'TMDB',
    title,
    displayTitle: title,
    posterUrl: posterPath,
    ref: `${kind}:${tmdbId}`,
    tmdbKind: kind,
    tmdbId,
    tmdbTitle: title,
    tmdbPoster: posterPath,
  };
}
