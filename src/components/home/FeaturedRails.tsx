'use client';

import { memo, useId, useMemo } from 'react';
import { AnimatedSection } from '@/components/ui/AnimatedSection';
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

  const railSections = useMemo(
    () =>
      rails.map((rail, railIndex) => {
        const headingId = `${baseId}-rail-${railIndex}`;
        return (
          <AnimatedSection key={headingId} stagger aria-labelledby={headingId}>
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
              {rail.items.map((item, index) => (
                <div
                  key={item.id}
                  data-rail-card
                  className="w-[140px] shrink-0 snap-start sm:w-[170px]"
                >
                  <MediaCard
                    item={item}
                    priority={index < 4}
                    rank={railIndex === 1 && index < 10 ? index + 1 : undefined}
                  />
                </div>
              ))}
            </RailScroller>
          </AnimatedSection>
        );
      }),
    [rails, baseId, t],
  );

  return <div className="home-rails mt-2 space-y-12 sm:mt-8">{railSections}</div>;
}

export const FeaturedRails = memo(FeaturedRailsInner);

// Keep the old name as an alias so existing imports don't break immediately.
// TODO: remove after all consumers are updated.
export { FeaturedRails as Rails };
