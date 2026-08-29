'use client';

import { motion } from 'motion/react';
import { useId } from 'react';
import { memo, useMemo } from 'react';
import { viewFadeUp, viewScaleIn } from '@/components/motion/variants';
import { RailScroller } from '@/components/ui/rail';
import { useT } from '@/lib/i18n';
import type { FeaturedRail } from '@/types';
import { Card } from './Card';

interface RailsProps {
  rails: FeaturedRail[];
}

function RailsInner({ rails }: RailsProps) {
  const t = useT();
  const baseId = useId();

  const railSections = useMemo(
    () =>
      rails.map((rail, railIndex) => {
        const headingId = `${baseId}-rail-${railIndex}`;
        return (
          <motion.section
            key={headingId}
            aria-labelledby={headingId}
            variants={viewFadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.18 }}
          >
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
            <RailScroller>
              {rail.items.map((item, index) => (
                <motion.div
                  key={item.id}
                  className="w-[140px] shrink-0 snap-start sm:w-[170px]"
                  variants={viewScaleIn}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true, amount: 0.35 }}
                  whileHover={{ y: -6 }}
                  transition={{ duration: 0.35 }}
                >
                  <Card
                    item={item}
                    priority={index < 4}
                    rank={railIndex === 1 && index < 10 ? index + 1 : undefined}
                  />
                </motion.div>
              ))}
            </RailScroller>
          </motion.section>
        );
      }),
    [rails, baseId, t],
  );

  return <div className="mt-2 space-y-12 sm:mt-8">{railSections}</div>;
}

export const Rails = memo(RailsInner);
