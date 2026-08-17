'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';
import { forwardRef, memo, type ReactNode, useRef } from 'react';
import { fadeIn } from '@/components/motion';
import type { Media } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import { MemoCard } from './Card';

type Props = {
  title: string;
  items: Media[];
  onOpen: (item: Media) => void;
  loading: boolean;
};

// Static, stable keys for the loading-skeleton rail.
const SKELETON_KEYS = Array.from({ length: 6 }, (_, i) => `rail-skeleton-${i}`);

function RailBase({ title, items, onOpen, loading }: Props) {
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
    <motion.section
      initial="hidden"
      animate="visible"
      variants={fadeIn}
      className="mt-8 min-w-0 sm:mt-10"
    >
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
        {items.slice(0, 12).map((item) => (
          <MemoCard
            key={`${title}-${item.link}`}
            item={item}
            onOpen={onOpen}
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

// Single shared scroller DOM node. Bleeds to the viewport edge on phones
// (where the rail SHOULD be full-bleed), then sits inside the section
// padding on sm+.
const RailScroller = forwardRef<HTMLDivElement, { children: ReactNode }>(function RailScroller(
  { children },
  ref,
) {
  return (
    <div
      ref={ref}
      // content-visibility skips layout/paint for off-screen rails.
      className={cn(
        'scrollbar-none flex snap-x snap-proximity gap-3 overflow-x-auto pb-3 sm:gap-4',
        '-mx-4 px-4 sm:mx-0 sm:px-0 contain-paint',
        // Intrinsic size matches the poster 2:3 card at sm:160px ≈ 240px
        // so off-screen rails reserve the right height and the scrollbar
        // doesn't jump.
        '[content-visibility:auto]',
        '[contain-intrinsic-size:auto_240px]',
      )}
    >
      {children}
    </div>
  );
});

function RailArrow({
  onClick,
  ariaLabel,
  children,
}: {
  onClick: () => void;
  ariaLabel: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className="touch-target grid place-items-center rounded-full border border-border/60 bg-background/60 text-muted-foreground transition hover:bg-secondary"
    >
      {children}
    </button>
  );
}

function Skeleton() {
  return (
    <div
      aria-hidden="true"
      className="shrink-0 basis-[clamp(140px,38vw,200px)] animate-pulse motion-reduce:animate-none rounded-xl bg-secondary sm:basis-[160px] aspect-[2/3]"
    />
  );
}
