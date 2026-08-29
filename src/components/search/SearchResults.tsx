'use client';

import { Card } from '@/components/home/Card';
import { useT } from '@/lib/i18n';
import type { SearchResult } from '@/types';

export function SearchResults({ query, results }: { query: string; results: SearchResult[] }) {
  const t = useT();
  return (
    <section aria-labelledby="results-heading" aria-live="polite" className="mt-10">
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            {t('search.discovery')}
          </p>
          <h2 id="results-heading" className="mt-1 text-2xl font-semibold tracking-tight">
            {t('search.resultsFor', { query })}
          </h2>
        </div>
        <span className="text-sm text-muted-foreground">
          {t('home.titlesCount', { count: results.length })}
        </span>
      </div>
      {results.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-6">
          {results.map((item, index) => (
            <Card key={item.id} item={item} priority={index < 4} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center">
          <p className="font-semibold">{t('search.noResults')}</p>
          <p className="mt-2 text-sm text-muted-foreground">{t('search.noResultsHint')}</p>
        </div>
      )}
    </section>
  );
}
