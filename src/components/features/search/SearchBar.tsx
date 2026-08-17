'use client';

import { Search, X } from 'lucide-react';
import type { FormEvent } from 'react';

type Props = {
  query: string;
  onQueryChange: (query: string) => void;
  onSubmit: (event: FormEvent) => void;
};

export function SearchBar({ query, onQueryChange, onSubmit }: Props) {
  return (
    <form
      onSubmit={onSubmit}
      className="flex w-full items-center gap-2 rounded-lg border border-border bg-secondary/60 px-3 py-2 transition focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/50"
    >
      <Search className="size-4 shrink-0 text-muted-foreground" />
      <input
        value={query}
        name="search"
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Search movies, shows, episodes…"
        autoComplete="off"
        spellCheck={false}
        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        aria-label="Search"
        enterKeyHint="search"
      />
      {query && (
        <button
          type="button"
          onClick={() => onQueryChange('')}
          aria-label="Clear search"
          className="touch-target grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground/70 hover:bg-background hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      )}
      <kbd className="hidden rounded bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground sm:block">
        ENTER
      </kbd>
    </form>
  );
}
