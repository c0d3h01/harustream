'use client';

import { X } from 'lucide-react';
import type { FormEvent } from 'react';
import { memo } from 'react';
import { MemoCard } from '@/components/features/home/Card';
import type { Media } from '@/lib/api/client';
import { SearchBar } from './SearchBar';

type Props = {
  query: string;
  results: Media[];
  loading: boolean;
  history: string[];
  onQueryChange: (query: string) => void;
  onSubmit: (event: FormEvent) => void;
  onOpen: (item: Media) => void;
  onHistoryRemove: (query: string) => void;
  onHistoryClear: () => void;
  onHistorySearch: (query: string) => void;
};

// Static, stable keys for the search skeleton grid.
const SKELETON_KEYS = Array.from({ length: 12 }, (_, i) => `result-skeleton-${i}`);

export const Results = memo(function Results({
  query,
  results,
  loading,
  history,
  onQueryChange,
  onSubmit,
  onOpen,
  onHistoryRemove,
  onHistoryClear,
  onHistorySearch,
}: Props) {
  const providerGroups = Array.from(
    results.reduce((groups, item) => {
      const key = item.providerId ?? 'catalog';
      const current = groups.get(key) ?? {
        name: item.providerName ?? 'All providers',
        items: [] as Media[],
      };
      current.items.push(item);
      groups.set(key, current);
      return groups;
    }, new Map<string, { name: string; items: Media[] }>()),
  );

  return (
    <section className="py-6 sm:py-10">
      <div className="mb-6 sm:mb-8">
        <p className="text-xs font-medium uppercase tracking-wider text-primary sm:text-sm">
          Search results
        </p>
        <h1 className="mt-2 truncate text-2xl font-semibold sm:text-3xl">
          {query || 'Find a title'}
        </h1>
      </div>
      {/* Inline search bar — the only way to refine the query from this
          view. The header bar is the same widget, but on mobile it's
          collapsed behind an icon; this one is always visible. */}
      <div className="mb-6 sm:mb-8">
        <SearchBar
          query={query}
          onQueryChange={onQueryChange}
          onSubmit={onSubmit}
          loading={loading}
        />
      </div>

      {!query && history.length > 0 && (
        <div className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-tight sm:text-base">Recent searches</h2>
            <button
              type="button"
              onClick={onHistoryClear}
              className="touch-target text-xs font-medium text-primary"
            >
              Clear all
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {history.map((item) => (
              <span
                key={item}
                className="group inline-flex items-center gap-0.5 rounded-full border border-border/70 bg-background/60 py-1 pl-3 pr-1 text-sm backdrop-blur-xl"
              >
                <button
                  type="button"
                  onClick={() => onHistorySearch(item)}
                  className="touch-target max-w-[16rem] truncate text-muted-foreground hover:text-foreground"
                >
                  {item}
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${item} from recent searches`}
                  onClick={() => onHistoryRemove(item)}
                  className="touch-target grid size-6 place-items-center rounded-full text-muted-foreground/70 hover:bg-background hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div role="status" className="flex flex-col gap-4">
          <span className="sr-only">Searching the provider…</span>
          <p className="text-sm text-muted-foreground sm:text-base">Searching the provider…</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-x-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {SKELETON_KEYS.map((key) => (
              <div
                key={key}
                aria-hidden="true"
                className="shimmer rounded-xl bg-secondary aspect-[2/3]"
              />
            ))}
          </div>
        </div>
      ) : results.length ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            {results.length} {results.length === 1 ? 'title' : 'titles'} found
          </p>
          <div className="flex flex-col gap-8">
            {providerGroups.map(([providerId, group]) => (
              <section key={providerId} aria-labelledby={`provider-${providerId}`}>
                <div className="mb-3 flex items-end justify-between gap-3 border-b border-border/60 pb-3">
                  <div>
                    <h2 id={`provider-${providerId}`} className="text-base font-semibold">
                      {group.name}
                    </h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {group.items.length} matching titles
                    </p>
                  </div>
                  <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
                    Provider catalog
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-x-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                  {group.items.map((x, index) => (
                    <MemoCard
                      key={`${providerId}-${x.link}`}
                      item={x}
                      onOpen={onOpen}
                      index={index}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      ) : query ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground sm:p-12 sm:text-base">
          <p className="text-base font-semibold text-foreground">No titles found</p>
          <p className="mt-1">
            Nothing matched “{query}”. Try a different spelling or a broader search.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground sm:p-12 sm:text-base">
          <p className="text-base font-semibold text-foreground">Find your next story</p>
          <p className="mt-1">Type a title above to search movies and series across the catalog.</p>
        </div>
      )}
    </section>
  );
});
