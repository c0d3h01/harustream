'use client';

import { ViewTransition } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { useT } from '@/lib/i18n';
import type { TmdbCard } from '@/tmdb/catalog';
import { TmdbMediaCard } from './TmdbMediaCard';

interface TmdbSearchResultsProps {
  query: string;
  cards: TmdbCard[];
}

/** TMDB search grid — same list-identity pattern as the catalog grids:
 *  bare outer VT per card, inner poster morph first-occurrence-wins. */
export function TmdbSearchResults({ query, cards }: TmdbSearchResultsProps) {
  const t = useT();
  const seen = new Set<string>();
  return (
    <section aria-labelledby="results-heading" aria-live="polite" className="mt-10">
      <SectionHeader
        eyebrow={t('search.discovery')}
        heading={t('search.resultsFor', { query })}
        headingId="results-heading"
        trailing={
          <span className="text-sm text-muted-foreground">
            {t('home.titlesCount', { count: cards.length })}
          </span>
        }
        className="mb-5"
      />
      {cards.length ? (
        <div className="grid grid-cols-[repeat(auto-fit,140px)] gap-3 sm:gap-4">
          {cards.map((card, index) => {
            const dedupeKey = `${card.kind}:${card.tmdbId}`;
            const firstSeen = !seen.has(dedupeKey);
            seen.add(dedupeKey);
            return (
              <ViewTransition key={dedupeKey}>
                <TmdbMediaCard card={card} priority={index < 4} sharePoster={firstSeen} />
              </ViewTransition>
            );
          })}
        </div>
      ) : (
        <ViewTransition enter="fade-in" exit="fade-out" default="none">
          <EmptyState heading={t('search.noResults')} hint={t('search.noResultsHint')} />
        </ViewTransition>
      )}
    </section>
  );
}
