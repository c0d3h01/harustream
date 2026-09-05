'use client';

import { ViewTransition } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { MediaCard } from '@/components/ui/MediaCard';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { useT } from '@/lib/i18n';
import type { SearchResult } from '@/types';

export function SearchResults({ query, results }: { query: string; results: SearchResult[] }) {
  const t = useT();
  return (
    <section aria-labelledby="results-heading" aria-live="polite" className="mt-10">
      <SectionHeader
        eyebrow={t('search.discovery')}
        heading={t('search.resultsFor', { query })}
        headingId="results-heading"
        trailing={
          <span className="text-sm text-muted-foreground">
            {t('home.titlesCount', { count: results.length })}
          </span>
        }
        className="mb-5"
      />
      {results.length ? (
        <div className="grid grid-cols-[repeat(auto-fit,140px)] gap-3 sm:gap-4">
          {/* List identity: bare outer VT glides on filter/reorder updates.
              Inner poster morph lives inside MediaCard (nested pair). */}
          {results.map((item, index) => (
            <ViewTransition key={item.id}>
              <MediaCard item={item} priority={index < 4} sharePoster />
            </ViewTransition>
          ))}
        </div>
      ) : (
        <ViewTransition enter="fade-in" exit="fade-out" default="none">
          <EmptyState heading={t('search.noResults')} hint={t('search.noResultsHint')} />
        </ViewTransition>
      )}
    </section>
  );
}
