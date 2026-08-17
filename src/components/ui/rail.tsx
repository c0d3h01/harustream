import { forwardRef, type ReactNode } from 'react';
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
