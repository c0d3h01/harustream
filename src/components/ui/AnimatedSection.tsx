'use client';

import type { ElementType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

// Render-animation free section. Previously this was a scroll-triggered
// reveal (IntersectionObserver + `.animated-section` CSS). That entrance
// motion is removed: pages render instantly. The component stays as a
// passthrough so existing imports (`stagger`, `as`, extra props) keep
// working — `stagger` is accepted but intentionally ignored.
//
// Scroll reveals now come from `<ViewTransition>` Suspense reveals where
// data arrival is the trigger, not scroll position.

interface AnimatedSectionProps {
  /** The HTML element to render. Defaults to `'section'`. */
  as?: ElementType;
  /** Accepted for backwards compat — ignored (no stagger animation). */
  stagger?: boolean;
  /** Additional className on the root element. */
  className?: string;
  children: ReactNode;
  /** Extra props passed through to the root element. */
  [key: string]: unknown;
}

export function AnimatedSection({
  as: Tag = 'section',
  stagger: _stagger = false,
  className,
  children,
  ...rest
}: AnimatedSectionProps) {
  return (
    <Tag className={cn(className)} {...rest}>
      {children}
    </Tag>
  );
}
