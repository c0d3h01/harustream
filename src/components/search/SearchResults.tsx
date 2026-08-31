'use client';

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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-6">
          {results.map((item, index) => (
            <MediaCard key={item.id} item={item} priority={index < 4} />
          ))}
        </div>
      ) : (
        <EmptyState heading={t('search.noResults')} hint={t('search.noResultsHint')} />
      )}
    </section>
  );
}
