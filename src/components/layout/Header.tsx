'use client';

import { Bookmark, Search, Settings, X } from 'lucide-react';
import { type FormEvent, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import type { View } from '@/lib/state/reducer';
import { cn } from '@/lib/utils';

type Props = {
  view: View;
  query: string;
  mobileSearchOpen: boolean;
  onSetMobileSearchOpen: (open: boolean) => void;
  onSetView: (view: View) => void;
  onQueryChange: (query: string) => void;
  onSubmit: (event: FormEvent) => void;
  libraryCount: number;
};

export function Header({
  view,
  query,
  mobileSearchOpen,
  onSetMobileSearchOpen,
  onSetView,
  onQueryChange,
  onSubmit,
  libraryCount,
}: Props) {
  const mobileInputRef = useRef<HTMLInputElement | null>(null);

  // Focus the expanded mobile search field when it opens. The row stays
  // mounted (hidden/block toggle), so `autoFocus` only fires once; focus
  // imperatively whenever it becomes visible.
  useEffect(() => {
    if (mobileSearchOpen) {
      mobileInputRef.current?.focus();
    }
  }, [mobileSearchOpen]);

  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/90 pt-safe backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1500px] items-center gap-3 px-4 sm:h-16 sm:gap-5 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={() => onSetView('home')}
          aria-label="Home"
          aria-current={view === 'home' ? 'page' : undefined}
          className="touch-target flex shrink-0 items-center gap-2 rounded-lg text-base font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-lg"
        >
          <span className="shrink-0">
            {/* biome-ignore lint/performance/noImgElement: images are served unoptimized (next.config `images.unoptimized`), so next/image adds no value here. */}
            <img src="/favicon/icon.png" alt="" className="size-8 rounded-lg" />
          </span>
          <span className="hidden sm:inline">harustream</span>
        </button>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          <Button
            size="sm"
            variant={view === 'home' ? 'secondary' : 'ghost'}
            aria-current={view === 'home' ? 'page' : undefined}
            onClick={() => onSetView('home')}
          >
            Browse
          </Button>
          <Button
            size="sm"
            variant={view === 'library' ? 'secondary' : 'ghost'}
            aria-current={view === 'library' ? 'page' : undefined}
            onClick={() => onSetView('library')}
          >
            My List
          </Button>
        </nav>

        {/* Inline search on md+; the icon-only toggle is hidden. The
            focus-within ring is the only visible focus indicator — the
            input itself has outline-none for visual cleanliness. */}
        <form
          onSubmit={onSubmit}
          className="ml-auto hidden w-full max-w-md items-center gap-2 rounded-lg border border-border bg-secondary/60 px-3 py-2 transition focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/50 md:flex"
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
          <kbd className="hidden rounded bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground sm:block">
            ENTER
          </kbd>
        </form>

        {/* Mobile-only icon toggles the search field below. */}
        <Button
          size="icon"
          variant="ghost"
          className="ml-auto touch-target md:hidden"
          aria-label={mobileSearchOpen ? 'Close search' : 'Open search'}
          aria-expanded={mobileSearchOpen}
          onClick={() => onSetMobileSearchOpen(!mobileSearchOpen)}
        >
          {mobileSearchOpen ? <X className="size-5" /> : <Search className="size-5" />}
        </Button>

        <Button
          size="icon"
          variant="ghost"
          onClick={() => onSetView('library')}
          aria-label="My list"
          aria-current={view === 'library' ? 'page' : undefined}
          className="touch-target relative shrink-0"
        >
          <Bookmark className="size-5" />
          {libraryCount > 0 && (
            <span className="absolute right-1 top-1 size-1.5 rounded-full bg-primary" />
          )}
        </Button>

        <Button
          size="icon"
          variant="ghost"
          onClick={() => onSetView('settings')}
          aria-label="Settings"
          aria-current={view === 'settings' ? 'page' : undefined}
          className="touch-target shrink-0"
        >
          <Settings className="size-5" />
        </Button>
      </div>

      {/* Expanded mobile search row. Sits under the header so the user's
          thumb doesn't have to reach to the top of the screen. */}
      <div
        className={cn(
          'border-t border-border/60 px-4 pb-3 pt-2 transition focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/50 md:hidden',
          mobileSearchOpen ? 'block' : 'hidden',
        )}
      >
        <form
          onSubmit={(e) => {
            onSubmit(e);
            onSetMobileSearchOpen(false);
          }}
          className="flex items-center gap-2 rounded-lg border border-border bg-secondary/60 px-3 py-2"
        >
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={mobileInputRef}
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
        </form>
      </div>
    </header>
  );
}
