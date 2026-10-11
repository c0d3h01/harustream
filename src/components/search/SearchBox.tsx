'use client';

import { Search, X } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

export function SearchBox({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState(initialQuery);
  const pushedRef = useRef(initialQuery);

  useEffect(() => {
    if (initialQuery === pushedRef.current) return;
    pushedRef.current = initialQuery;
    setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = query.trim();
      if (next === pushedRef.current.trim()) return;
      pushedRef.current = next;
      router.replace(next ? `${pathname}?q=${encodeURIComponent(next)}` : pathname, {
        scroll: false,
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [pathname, query, router]);

  const applyQuery = (next: string) => {
    pushedRef.current = next;
    setQuery(next);
    router.replace(next ? `${pathname}?q=${encodeURIComponent(next)}` : pathname, {
      scroll: false,
    });
  };

  return (
    <search>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          applyQuery(query.trim());
        }}
        className="relative"
      >
        <label htmlFor="title-search" className="sr-only">
          {'Search movies and series'}
        </label>
        <Search
          className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          id="title-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={'Search movies, shows, and anime'}
          autoComplete="off"
          maxLength={200}
          enterKeyHint="search"
          className="h-14 w-full rounded-lg border border-border bg-card pr-12 pl-12 text-base outline-none transition-all duration-200 placeholder:text-muted-foreground hover:border-input focus:border-input focus:ring-2 focus:ring-ring/25 [&::-webkit-search-cancel-button]:hidden"
        />
        {query ? (
          <button
            type="button"
            onClick={() => applyQuery('')}
            aria-label={'Clear search'}
            className="absolute top-1/2 right-3 grid size-9 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition-all duration-150 hover:bg-muted hover:text-foreground active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </form>
    </search>
  );
}
