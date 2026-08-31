'use client';

import { Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AnimatedSection } from '@/components/ui/AnimatedSection';
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
      setConfirming(true);
      confirmTimer.current = window.setTimeout(() => setConfirming(false), 3000);
      return;
    }
    if (confirmTimer.current) window.clearTimeout(confirmTimer.current);
    setConfirming(false);
    progress.forEach((entry) => {
      entry.clearAll();
    });
  };

  if (!items.length) return null;

  return (
    <AnimatedSection stagger className="cw-root mt-8" aria-labelledby="continue-watching-heading">
      <SectionHeader
        eyebrow={t('home.continueWatching')}
        heading={t('library.heading')}
        headingId="continue-watching-heading"
        trailing={
          <Button
            size="sm"
            variant="ghost"
            onClick={handleClearAll}
            className="touch-target text-xs text-muted-foreground hover:text-destructive"
          >
            {confirming ? t('home.clearAllConfirm') : t('home.clearAll')}
          </Button>
        }
      />
      <RailScroller>
        {items.map((item, index) => {
          const provider = item.provider ?? 'movieBoxWeb';
          const percentage = item.duration ? Math.round((item.position / item.duration) * 100) : 0;
          const href = localeHref(
            locale,
            `/watch/${encodeURIComponent(provider)}/${encodeRef(item.ref)}${item.episodeRef ? `?episode=${encodeURIComponent(item.episodeRef)}` : ''}`,
          );

          const cardItem: MediaCardItem = {
            id: `${provider}:${item.ref}:${item.episodeRef}`,
            providerId: provider,
            providerName: provider,
            title: item.title ?? t('home.untitled'),
            displayTitle: item.title ?? t('home.untitled'),
            posterUrl: item.poster,
            ref: item.ref,
            kind: item.type,
          };

          return (
            <div
              key={`${provider}:${item.ref}:${item.episodeRef}`}
              className="cw-card w-[150px] shrink-0 snap-start"
            >
              <MediaCard
                item={cardItem}
                href={href}
                priority={index < 4}
                progress={percentage}
                onRemove={() => {
                  const entry = progress.find((e) =>
                    e.list.some((saved) => saved.ref === item.ref),
                  );
                  if (entry) entry.clear(item.ref, item.episodeRef);
                }}
              >
                <span
                  className="absolute right-2 bottom-2 grid size-8 place-items-center rounded-full bg-primary text-primary-foreground opacity-0 shadow-lg transition group-hover:opacity-100"
                  aria-hidden="true"
                >
                  <Play className="size-3.5 fill-current" />
                </span>
              </MediaCard>
            </div>
          );
        })}
      </RailScroller>
    </AnimatedSection>
  );
}

// Keep the old name as an alias for backwards compatibility.
export { ContinueWatchingRail as ContinueWatching };
