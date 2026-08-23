'use client';

import { Search, X } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export function SearchBox({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState(initialQuery);

  useEffect(() => setQuery(initialQuery), [initialQuery]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = query.trim();
      if (next === initialQuery.trim()) return;
      router.replace(next ? `${pathname}?q=${encodeURIComponent(next)}` : pathname, {
        scroll: false,
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [initialQuery, pathname, query, router]);

  return (
    <search>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const next = query.trim();
          router.replace(next ? `${pathname}?q=${encodeURIComponent(next)}` : pathname);
        }}
        className="relative"
      >
        <label htmlFor="title-search" className="sr-only">
          Search movies and series
        </label>
        <Search
          className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          id="title-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search movies, shows, and anime"
          autoComplete="off"
          className="h-14 w-full rounded-2xl border border-border/70 bg-card/80 px-12 pr-12 text-base outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Clear search"
            className="absolute top-1/2 right-3 grid size-9 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        )}
      </form>
    </search>
  );
}
