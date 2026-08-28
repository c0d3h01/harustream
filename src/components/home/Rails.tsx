'use client';

import { useId } from 'react';
import { RailScroller } from '@/components/ui/rail';
import { useT } from '@/lib/i18n';
import type { FeaturedRail } from '@/types';
import { Card } from './Card';

export function Rails({ rails }: { rails: FeaturedRail[] }) {
  const t = useT();
  const baseId = useId();
  return (
    <div className="mt-2 space-y-12 sm:mt-8">
      {rails.map((rail, railIndex) => {
        // useId-derived ids are stable per rail; the raw rail title contained
        // spaces/quotes which made invalid HTML ids and duplicate-key risks.
        const headingId = `${baseId}-rail-${railIndex}`;
        return (
          <section key={headingId} aria-labelledby={headingId}>
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                  {t('home.railEyebrow')}
                </p>
                <h2 id={headingId} className="mt-1 text-xl font-semibold tracking-tight">
                  {rail.title}
                </h2>
              </div>
              <span className="pb-0.5 text-xs text-muted-foreground">
                {t('home.titlesCount', { count: rail.items.length })}
              </span>
            </div>
            {/* RailScroller is the single shared horizontal scroller: snap
                points, edge fade mask and content-visibility all come from it. */}
            <RailScroller>
              {rail.items.map((item, index) => (
                <div key={item.id} className="w-[140px] shrink-0 snap-start sm:w-[170px]">
                  <Card
                    item={item}
                    priority={index < 4}
                    rank={railIndex === 1 && index < 10 ? index + 1 : undefined}
                  />
                </div>
              ))}
            </RailScroller>
          </section>
        );
      })}
    </div>
  );
}
