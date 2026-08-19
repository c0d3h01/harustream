'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';
import { memo, useRef } from 'react';
import { fadeIn } from '@/components/motion/variants';
import { RailArrow, RailScroller } from '@/components/ui/rail';
import type { Media } from '@/lib/api/client';
import { MemoCard } from './Card';

type Props = {
  title: string;
  items: Media[];
  onOpen: (item: Media) => void;
  loading: boolean;
  /** Eager-load the first poster: the rail's first row is above the fold
   *  on the home page, so its lead card contributes to the LCP. */
  priorityFirst?: boolean;
};

// Static, stable keys for the loading-skeleton rail.
const SKELETON_KEYS = Array.from({ length: 6 }, (_, i) => `rail-skeleton-${i}`);

function RailBase({ title, items, onOpen, loading, priorityFirst = false }: Props) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const scrollByPage = (dir: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  if (loading) {
    return (
      <section className="mt-8 min-w-0 sm:mt-10">
        <h2 className="mb-3 text-base font-semibold sm:mb-4 sm:text-lg">{title}</h2>
        <RailScroller ref={scrollerRef}>
          {SKELETON_KEYS.map((key) => (
            <Skeleton key={key} />
          ))}
        </RailScroller>
      </section>
    );
  }

  if (!items.length) {
    return (
      <section className="mt-8 min-w-0 sm:mt-10">
        <h2 className="mb-3 text-base font-semibold sm:mb-4 sm:text-lg">{title}</h2>
        <p className="text-sm text-muted-foreground">No titles returned by this provider.</p>
      </section>
    );
  }

  return (
    // The loading branch above returns a separate subtree, so this section
    // mounts fresh when the skeleton swaps out — the fade-in covers the
    // skeleton -> content jump.
    <motion.section initial="hidden" animate="visible" variants={fadeIn} className="mt-0 min-w-0">
      <div className="mb-3 flex items-center justify-between sm:mb-4">
        <h2 className="text-base font-semibold tracking-tight sm:text-lg">{title}</h2>
        <div className="hidden items-center gap-1 sm:flex">
          <RailArrow onClick={() => scrollByPage(-1)} ariaLabel={`Scroll ${title} backwards`}>
            <ChevronLeft className="size-4" />
          </RailArrow>
          <RailArrow onClick={() => scrollByPage(1)} ariaLabel={`Scroll ${title} forwards`}>
            <ChevronRight className="size-4" />
          </RailArrow>
        </div>
      </div>
      <RailScroller ref={scrollerRef}>
        {items.slice(0, 12).map((item, index) => (
          <MemoCard
            key={`${title}-${item.link}`}
            item={item}
            onOpen={onOpen}
            priority={priorityFirst && index === 0}
            index={index}
            className="basis-[clamp(140px,38vw,200px)] sm:basis-[160px]"
          />
        ))}
      </RailScroller>
    </motion.section>
  );
}

// Memoized so typing in the search bar / toggling provider doesn't re-render
// every rail on the home page when its props are unchanged.
export const Rail = memo(RailBase);

// --- Internal helpers ---------------------------------------------------

function Skeleton() {
  return (
    <div
      aria-hidden="true"
      className="shimmer shrink-0 basis-[clamp(140px,38vw,200px)] rounded-xl bg-secondary sm:basis-[160px] aspect-[2/3]"
    />
  );
}
