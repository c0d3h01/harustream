import { ViewTransition } from 'react';
import { MediaCard } from '@/components/ui/MediaCard';
import { tmdbPath } from '@/lib/routes';
import type { TmdbCard } from '@/tmdb/catalog';
import { tmdbImageUrl } from '@/tmdb/images';

interface TmdbSearchResultsProps {
  query: string;
  cards: TmdbCard[];
}

export function TmdbSearchResults({ query, cards }: TmdbSearchResultsProps) {
  if (!query) return null;
  return (
    <section aria-labelledby="results-heading" className="content-gutter mt-10">
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <h2
            id="results-heading"
            className="font-heading text-[1.75rem] leading-tight tracking-[-0.01em] text-balance"
          >
            {`Results for "${query}"`}
          </h2>
        </div>
        <div className="shrink-0">
          <span className="font-mono text-xs text-muted-foreground tabular-nums" role="status">
            {`${cards.length} titles`}
          </span>
        </div>
      </div>
      {cards.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-6">
          {cards.map((card, index) => {
            const dedupeKey = `${card.kind}:${card.tmdbId}`;
            return (
              <MediaCard
                key={dedupeKey}
                card={{
                  key: dedupeKey,
                  title: card.title,
                  href: tmdbPath(card.kind, card.tmdbId),
                  posterUrl: card.posterPath ? tmdbImageUrl(card.posterPath, 'w342') : undefined,
                  year: card.year,
                  rating: card.rating,
                }}
                priority={index < 4}
              />
            );
          })}
        </div>
      ) : (
        <ViewTransition enter="fade-in" exit="fade-out" default="none">
          <div className="rounded-xl border border-border bg-card p-12 text-center sm:p-14">
            <p className="font-heading text-2xl leading-tight tracking-[-0.01em]">
              {'No titles found'}
            </p>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
              {'Try a broader title or check the spelling.'}
            </p>
          </div>
        </ViewTransition>
      )}
    </section>
  );
}
