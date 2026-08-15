'use client';

import { Bookmark } from 'lucide-react';
import { memo } from 'react';
import { MemoCard } from '@/components/home/Card';
import type { Media } from '@/lib/api/client';

type Props = {
  items: Media[];
  onOpen: (item: Media) => void;
  onSearch: () => void;
};

export const Library = memo(function Library({ items, onOpen, onSearch }: Props) {
  return (
    <section className="py-6 sm:py-10">
      <p className="text-xs font-medium uppercase tracking-wider text-primary sm:text-sm">
        Your library
      </p>
      <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">My List</h1>
      {items.length ? (
        <div className="mt-6 grid grid-cols-2 gap-x-3 gap-y-6 sm:mt-8 sm:grid-cols-3 sm:gap-x-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {items.map((x) => (
            <MemoCard key={x.link} item={x} onOpen={onOpen} />
          ))}
        </div>
      ) : (
        <div className="mt-6 flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground sm:mt-8 sm:p-12">
          <Bookmark className="size-8 text-muted-foreground/60" aria-hidden="true" />
          <p className="text-base font-semibold text-foreground">Your list is empty</p>
          <p className="max-w-sm">
            Save movies and series to build your watchlist. It’s stored on this device, per
            provider.
          </p>
          <button
            type="button"
            onClick={onSearch}
            className="touch-target mt-1 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Find a title
          </button>
        </div>
      )}
    </section>
  );
});
