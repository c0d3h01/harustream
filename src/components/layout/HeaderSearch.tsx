'use client';

import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function HeaderSearch() {
  const router = useRouter();
  return (
    <search className="relative min-w-0 w-full">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const next = String(new FormData(event.currentTarget).get('q') ?? '')
            .trim()
            .slice(0, 200);
          router.push(next ? `/search?q=${encodeURIComponent(next)}` : '/search');
        }}
      >
        <label htmlFor="header-search" className="sr-only">
          {'Search titles'}
        </label>
        <Search
          className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          id="header-search"
          name="q"
          type="search"
          placeholder={'Search titles…'}
          autoComplete="off"
          enterKeyHint="search"
          className="h-10 w-full rounded-lg border border-border bg-card pr-4 pl-10 text-sm outline-none transition-all duration-200 placeholder:text-muted-foreground hover:border-input focus:border-ring focus:ring-2 focus:ring-ring/15 [&::-webkit-search-cancel-button]:hidden"
        />
      </form>
    </search>
  );
}
