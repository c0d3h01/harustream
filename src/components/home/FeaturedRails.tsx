'use client';

import { memo, useId, useMemo, ViewTransition } from 'react';

import { MediaCard } from '@/components/ui/MediaCard';
import { RailScroller } from '@/components/ui/rail';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { useT } from '@/lib/i18n';
import type { FeaturedRail } from '@/types';

interface FeaturedRailsProps {
  rails: FeaturedRail[];
}

function FeaturedRailsInner({ rails }: FeaturedRailsProps) {
  const t = useT();
  const baseId = useId();

  const railSections = useMemo(() => {
    // One mounted `name` per item: the same title can appear in several rails
    // (and ContinueWatching mirrors the catalog above). Only the first
    // occurrence gets the shared morph — later duplicates render plain so the
    // transition never errors on duplicate names.
    const seen = new Set<string>();
    return rails.map((rail, railIndex) => {
      const headingId = `${baseId}-rail-${railIndex}`;
      return (
        <section key={headingId} aria-labelledby={headingId}>
          <SectionHeader
            eyebrow={t('home.railEyebrow')}
            heading={rail.title}
            headingId={headingId}
            trailing={
              <span className="pb-0.5 text-xs text-muted-foreground">
                {t('home.titlesCount', { count: rail.items.length })}
              </span>
            }
          />
          <RailScroller>
            {rail.items.map((item, index) => {
              const dedupeKey = `${item.providerId}:${item.ref}`;
              const firstSeen = !seen.has(dedupeKey);
              seen.add(dedupeKey);
              return (
                <ViewTransition key={item.id}>
                  <div data-rail-card className="w-45 shrink-0 snap-start">
                    <MediaCard
                      item={item}
                      priority={index < 4}
                      rank={railIndex === 1 && index < 10 ? index + 1 : undefined}
                      sharePoster={firstSeen}
                    />
                  </div>
                </ViewTransition>
              );
            })}
          </RailScroller>
        </section>
      );
    });
  }, [rails, baseId, t]);

  return <div className="home-rails mt-2 space-y-12 sm:mt-8">{railSections}</div>;
}

export const FeaturedRails = memo(FeaturedRailsInner);
