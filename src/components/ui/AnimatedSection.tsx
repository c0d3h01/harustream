'use client';

import { type ElementType, type ReactNode, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

// CSS-only scroll-triggered reveal. Uses IntersectionObserver to add a
// `data-visible` attribute when the element enters the viewport, which
// activates the CSS entrance animation defined in globals.css.
//
// Replaces the identical GSAP `fromTo` + `ScrollTrigger` pattern that was
// duplicated in Rails, ContinueWatching, and ProviderRail.
//
// When `stagger` is true, each direct child gets a `--stagger-index` custom
// property so CSS can apply incremental delays.

interface AnimatedSectionProps {
  /** The HTML element to render. Defaults to `'section'`. */
  as?: ElementType;
  /** Whether to apply staggered delays to direct children. */
  stagger?: boolean;
  /** Additional className on the root element. */
  className?: string;
  children: ReactNode;
  /** Extra props passed through to the root element. */
  [key: string]: unknown;
}

export function AnimatedSection({
  as: Tag = 'section',
  stagger = false,
  className,
  children,
  ...rest
}: AnimatedSectionProps) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Respect reduced-motion: skip the observer entirely so the element
    // starts in its final state (no transform, no opacity change).
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      data-visible={visible || undefined}
      data-stagger={stagger || undefined}
      className={cn('animated-section', className)}
      {...rest}
    >
      {children}
    </Tag>
  );
}
