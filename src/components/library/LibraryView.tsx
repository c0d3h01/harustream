'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, ViewTransition } from 'react';
import { buttonClassName } from '@/components/ui/button';
import { MediaCard } from '@/components/ui/MediaCard';
import { titleHref } from '@/lib/routes';
import { useLibrary, useSettings } from '@/lib/storage';

export function LibraryView() {
  const { settings } = useSettings();
  const tmdbLibrary = useLibrary('tmdb');
  const movieBoxLibrary = useLibrary('movieBoxWeb');
  const anikotoLibrary = useLibrary('anikoto');
  const torrentioLibrary = useLibrary('torrentio');
  const vegaLibrary = useLibrary('vega');
  const settingsLibrary = useLibrary(settings.provider);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const items = useMemo(() => {
    const seen = new Set<string>();
    return [
      ...tmdbLibrary.items,
      ...settingsLibrary.items,
      ...movieBoxLibrary.items,
      ...anikotoLibrary.items,
      ...torrentioLibrary.items,
      ...vegaLibrary.items,
    ].filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, [
    tmdbLibrary.items,
    settingsLibrary.items,
    movieBoxLibrary.items,
    anikotoLibrary.items,
    torrentioLibrary.items,
    vegaLibrary.items,
  ]);
  if (!mounted) {
    return (
      <section className="content-gutter pt-8 sm:pt-12 lg:pt-16" aria-hidden="true">
        <div className="animate-pulse bg-muted text-transparent select-none h-36 rounded-xl" />
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder list, never reorders.
              key={i}
              className="animate-pulse rounded-lg bg-muted text-transparent select-none aspect-2/3"
            />
          ))}
        </div>
      </section>
    );
  }
  return (
    <section className="content-gutter pt-8 sm:pt-12 lg:pt-16">
      <div className="border-b border-border pb-8">
        <p className="font-mono text-xs font-medium tracking-[0.22em] text-muted-foreground uppercase">
          {'Your library'}
        </p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <h1 className="font-heading text-4xl tracking-[-0.01em]">{'My list'}</h1>
          <p className="pb-1 font-mono text-xs text-muted-foreground tabular-nums">
            {`${items.length} saved titles on this device`}
          </p>
        </div>
      </div>
      {items.length ? (
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-6">
          {items.map((item) => {
            const tmdb =
              item.tmdbKind && item.tmdbId ? { kind: item.tmdbKind, id: item.tmdbId } : null;
            return (
              <MediaCard
                key={item.id}
                card={{
                  key: item.id,
                  title: item.displayTitle,
                  href: tmdb ? `/${tmdb.kind}/${tmdb.id}` : titleHref(item.providerId, item.ref),
                  posterUrl: (tmdb ? item.tmdbPoster : undefined) ?? item.posterUrl,
                }}
              />
            );
          })}
        </div>
      ) : (
        <ViewTransition enter="fade-in" exit="fade-out" default="none">
          <div className="rounded-xl border border-border bg-card p-12 text-center sm:p-14 mt-8">
            <p className="font-heading text-2xl leading-tight tracking-[-0.01em]">
              {'Your list is empty'}
            </p>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
              {'Save a title from its detail page to see it here.'}
            </p>
            <div className="mt-6">
              <Link
                href="/search"
                className={buttonClassName({
                  className:
                    'h-11 rounded-xl px-4 py-2.5 font-semibold transition-transform duration-150 active:scale-[0.98]',
                })}
              >
                {'Find a title'}
              </Link>
            </div>
          </div>
        </ViewTransition>
      )}
    </section>
  );
}
