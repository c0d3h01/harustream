'use client';

import { memo } from 'react';
import { MediaCard } from '@/components/ui/MediaCard';
import { localeHref, useLocale } from '@/lib/i18n';
import type { TmdbCard, TmdbKind } from '@/tmdb/catalog';
import { tmdbImageUrl } from '@/tmdb/images';
import { TmdbPlayButton } from './TmdbPlayButton';

/** TMDB detail path for a card (`/movie/123`, `/tv/456`). */
export function tmdbPath(kind: TmdbKind, tmdbId: number): string {
  return `/${kind}/${tmdbId}`;
}

interface TmdbMediaCardProps {
  card: TmdbCard;
  priority?: boolean;
  sharePoster?: boolean;
}

/** Adapts a TMDB card to the shared MediaCard (poster morph key is the
 *  globally unique `tmdb:{kind}:{id}`, so overlapping rails only need the
 *  existing first-occurrence-wins dedupe for `sharePoster`). */
function TmdbMediaCardInner({ card, priority = false, sharePoster = false }: TmdbMediaCardProps) {
  const { locale } = useLocale();
  return (
    <MediaCard
      item={{
        id: `tmdb:${card.kind}:${card.tmdbId}`,
        providerId: 'tmdb',
        providerName: 'TMDB',
        title: card.title,
        displayTitle: card.title,
        posterUrl: tmdbImageUrl(card.posterPath, 'w342'),
        ref: `${card.kind}:${card.tmdbId}`,
        kind: card.kind === 'movie' ? 'movie' : 'series',
        year: card.year,
        rating: card.rating,
        trailerRef: { kind: card.kind, tmdbId: card.tmdbId },
      }}
      href={localeHref(locale, tmdbPath(card.kind, card.tmdbId))}
      priority={priority}
      sharePoster={sharePoster}
      playButton={
        <TmdbPlayButton
          kind={card.kind}
          tmdbId={card.tmdbId}
          title={card.title}
          originalTitle={card.originalTitle}
          year={card.year}
          className="h-10 rounded-full px-4 text-sm"
        />
      }
    />
  );
}

export const TmdbMediaCard = memo(TmdbMediaCardInner);
