'use client';

import { motion } from 'motion/react';
import { forwardRef, type ReactNode } from 'react';
import { SPRING } from '@/components/motion/transitions';
import { cn } from '@/lib/utils';

// Single shared scroller DOM node used by every horizontal rail. Bleeds to
// the viewport edge on phones (where the rail SHOULD be full-bleed), then
// sits inside the section padding on sm+.
export const RailScroller = forwardRef<HTMLDivElement, { children: ReactNode }>(
  function RailScroller({ children }, ref) {
    return (
      <div
        ref={ref}
        // content-visibility skips layout/paint for off-screen rails.
        className={cn(
          'scrollbar-none mask-fade-x flex snap-x snap-proximity gap-3 overflow-x-auto pb-3 sm:gap-4',
          // Bleed to the viewport edge on phones (where the rail SHOULD be
          // full-bleed). The 1rem padding stays at EVERY breakpoint: the
          // mask-fade-x gradient erases the outer 1rem, so without it the
          // first/last card would be visibly faded even when unscrolled.
          // The matching negative margin keeps cards aligned with headings.
          '-mx-4 px-4 contain-paint',
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
  },
);

export function RailArrow({
  onClick,
  ariaLabel,
  children,
}: {
  onClick: () => void;
  ariaLabel: string;
  children: ReactNode;
}) {
  return (
    <motion.button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      transition={SPRING}
      className="touch-target grid place-items-center rounded-full border border-border/60 bg-background/60 text-muted-foreground transition-colors hover:bg-secondary"
    >
      {children}
    </motion.button>
  );
}
