'use client';

import { ArrowDownAZ, ArrowDownUp, Bookmark, Film, Search, Tv } from 'lucide-react';
import { motion } from 'motion/react';
import { memo, useMemo, useState } from 'react';
import { MemoCard } from '@/components/features/home/Card';
import { SPRING } from '@/components/motion/transitions';
import { viewFadeUp } from '@/components/motion/variants';
import { type Media, titleFor } from '@/lib/api/client';
import { useProgress } from '@/lib/hooks/useProgress';
import { cn } from '@/lib/utils';

type Filter = 'all' | 'movie' | 'series';
type Sort = 'recent' | 'az';

const FILTERS: { id: Filter; label: string; icon: typeof Film }[] = [
  { id: 'all', label: 'All', icon: Bookmark },
  { id: 'movie', label: 'Movies', icon: Film },
  { id: 'series', label: 'Series', icon: Tv },
];

const SORTS: { id: Sort; label: string; icon: typeof ArrowDownAZ }[] = [
  { id: 'recent', label: 'Recent', icon: ArrowDownUp },
  { id: 'az', label: 'A–Z', icon: ArrowDownAZ },
];

type Props = {
  items: Media[];
  provider: string;
  onOpen: (item: Media) => void;
  onSearch: () => void;
};

export const Library = memo(function Library({ items, provider, onOpen, onSearch }: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('recent');
  const progress = useProgress(provider);

  // Watch progress per saved link (max across episodes) so saved titles that
  // were started show a thin "in progress" bar, like the Continue-watching rail.
  const progressMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of progress.list()) {
      if (!entry.duration || entry.duration <= 0) continue;
      const pct = (entry.position / entry.duration) * 100;
      const prev = map.get(entry.link);
      if (prev === undefined || pct > prev) map.set(entry.link, pct);
    }
    return map;
  }, [progress.list]);

  const counts = useMemo(
    () => ({
      all: items.length,
      movie: items.filter((x) => x.type?.toLowerCase() !== 'series').length,
      series: items.filter((x) => x.type?.toLowerCase() === 'series').length,
    }),
    [items],
  );

  const visible = useMemo(() => {
    const filtered =
      filter === 'all'
        ? items
        : items.filter((x) => (x.type?.toLowerCase() === 'series') === (filter === 'series'));
    if (sort === 'az') {
      return [...filtered].sort((a, b) =>
        titleFor(a).toLocaleLowerCase().localeCompare(titleFor(b).toLocaleLowerCase()),
      );
    }
    return filtered;
  }, [items, filter, sort]);

  return (
    <section className="py-6 pb-24 sm:py-10 sm:pb-28">
      <motion.div
        variants={viewFadeUp}
        initial="hidden"
        animate="visible"
        className="mb-6 flex flex-wrap items-end justify-between gap-4"
      >
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Bookmark className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-primary sm:text-sm">
              Your library
            </p>
            <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">My List</h1>
          </div>
        </div>
        <div
          className="flex items-center gap-2 rounded-full border border-border/70 bg-card/70 px-3.5 py-2 text-xs font-medium"
          role="status"
        >
          <Bookmark className="size-3.5 text-primary" aria-hidden="true" />
          {items.length} {items.length === 1 ? 'title' : 'titles'} saved
        </div>
      </motion.div>

      {items.length === 0 ? (
        <motion.div
          variants={viewFadeUp}
          initial="hidden"
          animate="visible"
          className="relative mt-4 overflow-hidden rounded-3xl border border-border/70 bg-card/60 px-6 py-14 text-center sm:py-20"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 left-1/2 size-64 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
          />
          <span className="relative mx-auto grid size-16 place-items-center rounded-3xl bg-primary/10 text-primary">
            <Bookmark className="size-7" aria-hidden="true" />
          </span>
          <p className="relative mt-5 text-lg font-semibold tracking-tight">Your list is empty</p>
          <p className="relative mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
            Save movies and series to build your watchlist. It’s stored on this device, per
            provider.
          </p>
          <button
            type="button"
            onClick={onSearch}
            className="relative mt-6 inline-flex touch-target items-center gap-2 rounded-xl bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
          >
            <Search className="size-4" aria-hidden="true" />
            Find a title
          </button>
        </motion.div>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <fieldset
              className="inline-flex overflow-x-auto rounded-xl border border-border/70 bg-muted/40 p-1"
              aria-label="Filter library"
            >
              <legend className="sr-only">Filter library</legend>
              {FILTERS.map(({ id, label, icon: Icon }) => {
                const selected = filter === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setFilter(id)}
                    aria-pressed={selected}
                    className="relative shrink-0 touch-target rounded-lg px-3 py-1.5 text-xs font-semibold"
                  >
                    {selected && (
                      <motion.span
                        layoutId="library-filter-pill"
                        className="absolute inset-0 rounded-lg bg-foreground"
                        transition={SPRING}
                        aria-hidden="true"
                      />
                    )}
                    <span
                      className={cn(
                        'relative z-10 flex items-center gap-1.5 transition-colors',
                        selected ? 'text-background' : 'text-muted-foreground',
                      )}
                    >
                      <Icon className="size-3.5" aria-hidden="true" />
                      {label}
                      <span
                        className={cn(
                          'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                          selected ? 'bg-background/20' : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {counts[id]}
                      </span>
                    </span>
                  </button>
                );
              })}
            </fieldset>

            <fieldset
              className="inline-flex overflow-x-auto rounded-xl border border-border/70 bg-muted/40 p-1"
              aria-label="Sort library"
            >
              <legend className="sr-only">Sort library</legend>
              {SORTS.map(({ id, label, icon: Icon }) => {
                const selected = sort === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSort(id)}
                    aria-pressed={selected}
                    className="relative shrink-0 touch-target rounded-lg px-3 py-1.5 text-xs font-semibold"
                  >
                    {selected && (
                      <motion.span
                        layoutId="library-sort-pill"
                        className="absolute inset-0 rounded-lg bg-foreground"
                        transition={SPRING}
                        aria-hidden="true"
                      />
                    )}
                    <span
                      className={cn(
                        'relative z-10 flex items-center gap-1.5 transition-colors',
                        selected ? 'text-background' : 'text-muted-foreground',
                      )}
                    >
                      <Icon className="size-3.5" aria-hidden="true" />
                      {label}
                    </span>
                  </button>
                );
              })}
            </fieldset>
          </div>

          {visible.length ? (
            <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-x-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {visible.map((x, index) => (
                <MemoCard
                  key={`${x.link}-${x.type}`}
                  item={x}
                  onOpen={onOpen}
                  index={index}
                  progress={progressMap.get(x.link)}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground sm:p-12">
              <p className="text-base font-semibold text-foreground">
                No {filter === 'series' ? 'series' : 'movies'} saved yet
              </p>
              <p className="mt-1">
                Everything you save lands here.{' '}
                {filter !== 'all' && 'Switch to All to see the rest.'}
              </p>
              <button
                type="button"
                onClick={() => setFilter('all')}
                className="touch-target mt-4 rounded-lg bg-foreground px-4 py-2 text-xs font-medium text-background transition-opacity hover:opacity-80"
              >
                Show all
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
});
