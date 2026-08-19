'use client';

import { ArrowRight, Loader2, Search, X } from 'lucide-react';
import { type FormEvent, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

type Props = {
  query: string;
  onQueryChange: (query: string) => void;
  onSubmit: (event: FormEvent) => void;
  loading?: boolean;
};

export function SearchBar({ query, onQueryChange, onSubmit, loading = false }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  // The search view mounts fresh on every visit (view crossfade remounts it),
  // so focus the field so the user can start typing immediately.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const canSubmit = !loading && query.trim().length > 0;

  return (
    <search className="group relative block">
      <form onSubmit={onSubmit}>
        {/* Soft glow that fades in behind the bar while it's focused. */}
        <div
          aria-hidden="true"
          className="absolute -inset-px rounded-2xl bg-gradient-to-b from-primary/25 via-primary/5 to-transparent opacity-0 transition-opacity duration-300 group-focus-within:opacity-100"
        />
        <div className="relative flex h-14 items-center gap-2.5 rounded-2xl border border-border/70 bg-background/70 px-3 backdrop-blur-xl transition-colors focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/20">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Search className="size-[18px]" aria-hidden="true" />
          </span>
          <input
            ref={inputRef}
            value={query}
            name="search"
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search movies, shows, episodes…"
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-base outline-hidden placeholder:text-muted-foreground/80"
            aria-label="Search"
            enterKeyHint="search"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQueryChange('')}
              aria-label="Clear search"
              className="touch-target grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground/70 transition hover:bg-background hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
          <kbd className="hidden shrink-0 rounded-md border border-border/70 bg-secondary/60 px-1.5 py-1 text-[10px] font-medium text-muted-foreground sm:block">
            ENTER
          </kbd>
          <button
            type="submit"
            aria-label="Search"
            disabled={!canSubmit}
            className={cn(
              'touch-target grid size-9 shrink-0 place-items-center rounded-xl bg-foreground text-background transition-colors hover:bg-foreground/90 disabled:opacity-50',
            )}
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <ArrowRight className="size-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </form>
    </search>
  );
}
