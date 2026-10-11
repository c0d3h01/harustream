'use client';

import { startTransition, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { MediaCard } from '@/components/ui/MediaCard';
import { watchHref } from '@/lib/routes';
import { useProgress } from '@/lib/storage';

export function ContinueWatchingRail() {
  const movieBoxProgress = useProgress('movieBoxWeb');
  const anikotoProgress = useProgress('anikoto');
  const scopes = [
    { provider: 'movieBoxWeb', store: movieBoxProgress },
    { provider: 'anikoto', store: anikotoProgress },
  ] as const;

  const items = scopes
    .flatMap(({ provider, store }) => store.list.map((item) => ({ ...item, provider })))
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, 12);

  const [confirming, setConfirming] = useState(false);
  const confirmTimer = useRef<number | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(
    () => () => {
      if (confirmTimer.current) window.clearTimeout(confirmTimer.current);
    },
    [],
  );

  const handleClearAll = () => {
    if (!confirming) {
      startTransition(() => setConfirming(true));
      confirmTimer.current = window.setTimeout(
        () => startTransition(() => setConfirming(false)),
        3000,
      );
      return;
    }
    if (confirmTimer.current) window.clearTimeout(confirmTimer.current);
    startTransition(() => setConfirming(false));
    scopes.forEach(({ store }) => {
      store.clearAll();
    });
  };

  if (!mounted) {
    return (
      <div className="cw-root mt-10" aria-hidden="true">
        <div className="animate-pulse rounded-lg bg-muted text-transparent select-none mb-4 h-8 w-56" />
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 6 }, (_, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder list, never reorders.
              key={i}
              className="animate-pulse bg-muted text-transparent select-none aspect-2/3 w-35 shrink-0 rounded-[0.8rem] sm:w-44 lg:w-50.5"
            />
          ))}
        </div>
      </div>
    );
  }

  if (!items.length) return null;

  return (
    <section className="cw-root mt-10" aria-labelledby="continue-watching-heading">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h2
            id="continue-watching-heading"
            className="font-heading text-[1.75rem] leading-tight tracking-[-0.01em] text-balance"
          >
            {'Continue watching'}
          </h2>
        </div>
        <div className="shrink-0">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleClearAll}
            aria-label={'Clear all watched items'}
            className="touch-target text-xs transition-all duration-200 active:scale-95 text-muted-foreground hover:text-destructive"
          >
            {confirming ? 'Confirm clear?' : 'Clear all'}
          </Button>
        </div>
      </div>
      <div className="scrollbar-none flex min-w-0 snap-x snap-proximity gap-3 overflow-x-auto px-0.5 py-1 sm:gap-4 contain-paint [content-visibility:auto] [contain-intrinsic-size:auto_250px]">
        {items.map((item, index) => {
          const { provider } = item;
          const percentage = item.duration ? Math.round((item.position / item.duration) * 100) : 0;
          const tmdb =
            item.tmdbKind && item.tmdbId ? { kind: item.tmdbKind, id: item.tmdbId } : null;
          const href = tmdb
            ? `/${tmdb.kind}/${tmdb.id}`
            : watchHref(provider, item.ref, item.episodeRef || undefined);

          return (
            <div
              key={`${provider}:${item.ref}:${item.episodeRef}`}
              className="cw-card w-35 shrink-0 snap-start sm:w-44 lg:w-50.5"
            >
              <MediaCard
                card={{
                  key: `${provider}:${item.ref}:${item.episodeRef}`,
                  title: item.tmdbTitle ?? item.title ?? 'Untitled',
                  href,
                  posterUrl: (tmdb ? item.tmdbPoster : undefined) ?? item.poster,
                  progress: percentage,
                  onRemove: () => {
                    startTransition(() => {
                      const scope = scopes.find((entry) => entry.provider === item.provider);
                      scope?.store.clear(item.provider, item.ref, item.episodeRef);
                    });
                  },
                }}
                priority={index < 4}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
