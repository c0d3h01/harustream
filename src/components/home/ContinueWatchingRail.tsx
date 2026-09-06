'use client';

import { startTransition, useEffect, useRef, useState, ViewTransition } from 'react';

import { Button } from '@/components/ui/button';
import type { MediaCardItem } from '@/components/ui/MediaCard';
import { MediaCard } from '@/components/ui/MediaCard';
import { RailScroller } from '@/components/ui/rail';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { localeHref, useLocale, useT } from '@/lib/i18n';
import { encodeRef } from '@/lib/refs';
import { useProgress } from '@/lib/storage';

export function ContinueWatchingRail() {
  const t = useT();
  const { locale } = useLocale();

  const movieBoxProgress = useProgress('movieBoxWeb');
  const moviesmodProgress = useProgress('Moviesmod');
  const anikotoProgress = useProgress('anikoto');
  const progress = [movieBoxProgress, moviesmodProgress, anikotoProgress];

  const items = progress
    .flatMap((entry) => entry.list)
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, 12);

  const [confirming, setConfirming] = useState(false);
  const confirmTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (confirmTimer.current) window.clearTimeout(confirmTimer.current);
    },
    [],
  );

  if (!progress.length) return null;

  const handleClearAll = () => {
    if (!confirming) {
      // Arm the confirm — runs in a transition so the label swap can VT.
      startTransition(() => setConfirming(true));
      confirmTimer.current = window.setTimeout(
        () => startTransition(() => setConfirming(false)),
        3000,
      );
      return;
    }
    if (confirmTimer.current) window.clearTimeout(confirmTimer.current);
    startTransition(() => setConfirming(false));
    progress.forEach((entry) => {
      entry.clearAll();
    });
  };

  if (!items.length) return null;

  return (
    <section className="cw-root mt-8" aria-labelledby="continue-watching-heading">
      <SectionHeader
        eyebrow={t('home.continueWatching')}
        heading={t('library.heading')}
        headingId="continue-watching-heading"
        trailing={
          <Button
            size="sm"
            variant="ghost"
            onClick={handleClearAll}
            className="touch-target text-xs transition-all duration-200 active:scale-95 text-muted-foreground hover:text-destructive"
          >
            {confirming ? t('home.clearAllConfirm') : t('home.clearAll')}
          </Button>
        }
      />
      <RailScroller>
        {items.map((item, index) => {
          const provider = item.provider ?? 'movieBoxWeb';
          const percentage = item.duration ? Math.round((item.position / item.duration) * 100) : 0;
          // Entries carrying TMDB context link back to TMDB detail with TMDB
          // art; legacy entries keep the direct watch URL.
          const tmdb =
            item.tmdbKind && item.tmdbId ? { kind: item.tmdbKind, id: item.tmdbId } : null;
          const href = tmdb
            ? localeHref(locale, `/${tmdb.kind}/${tmdb.id}`)
            : localeHref(
                locale,
                `/watch/${encodeURIComponent(provider)}/${encodeRef(item.ref)}${item.episodeRef ? `?episode=${encodeURIComponent(item.episodeRef)}` : ''}`,
              );

          const cardItem: MediaCardItem = {
            id: `${provider}:${item.ref}:${item.episodeRef}`,
            providerId: provider,
            providerName: provider,
            title: item.tmdbTitle ?? item.title ?? t('home.untitled'),
            displayTitle: item.tmdbTitle ?? item.title ?? t('home.untitled'),
            posterUrl: (tmdb ? item.tmdbPoster : undefined) ?? item.poster,
            ref: item.ref,
            kind: item.type,
          };

          return (
            <ViewTransition key={`${provider}:${item.ref}:${item.episodeRef}`}>
              <div className="cw-card w-35 shrink-0 snap-start">
                <MediaCard
                  item={cardItem}
                  href={href}
                  priority={index < 4}
                  progress={percentage}
                  onRemove={() => {
                    // Removal shrinks the rail — transition so siblings glide
                    // (layout displacement morph) instead of teleporting.
                    startTransition(() => {
                      const entry = progress.find((e) =>
                        e.list.some((saved) => saved.ref === item.ref),
                      );
                      if (entry) entry.clear(item.ref, item.episodeRef);
                    });
                  }}
                />
              </div>
            </ViewTransition>
          );
        })}
      </RailScroller>
    </section>
  );
}
