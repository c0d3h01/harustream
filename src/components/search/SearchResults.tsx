import { Card } from '@/components/home/Card';
import type { SearchResult } from '@/types';

export function SearchResults({ query, results }: { query: string; results: SearchResult[] }) {
  return (
    <section aria-labelledby="results-heading" aria-live="polite" className="mt-10">
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Discovery
          </p>
          <h2 id="results-heading" className="mt-1 text-2xl font-semibold tracking-tight">
            Results for “{query}”
          </h2>
        </div>
        <span className="text-sm text-muted-foreground">{results.length} titles</span>
      </div>
      {results.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-6">
          {results.map((item, index) => (
            <Card key={item.id} item={item} priority={index < 4} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center">
          <p className="font-semibold">No titles found</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Try a broader title or check the spelling.
          </p>
        </div>
      )}
    </section>
  );
}
