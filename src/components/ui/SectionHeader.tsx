'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// Reusable section header used by every rail, the search results grid, the
// library, and the related-titles section. Keeps the eyebrow + heading + optional
// trailing meta layout in one place so visual rhythm stays consistent.

interface SectionHeaderProps {
  /** Small caps label above the heading (e.g. "Trending now"). */
  eyebrow?: string;
  /** The main heading text. */
  heading: string;
  /** HTML `id` for the heading — pass it when the parent `<section>` uses
   *  `aria-labelledby`. */
  headingId?: string;
  /** Trailing content aligned to the end (counts, links, buttons). */
  trailing?: ReactNode;
  /** Additional className on the wrapper. */
  className?: string;
}

export function SectionHeader({
  eyebrow,
  heading,
  headingId,
  trailing,
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn('mb-4 flex items-end justify-between gap-3', className)}>
      <div>
        {eyebrow ? (
          <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-primary">
            <span className="size-1 rounded-full bg-primary" aria-hidden="true" />
            {eyebrow}
          </p>
        ) : null}
        <h2
          id={headingId}
          className={cn('text-2xl font-semibold tracking-[-0.03em]', eyebrow && 'mt-3')}
        >
          {heading}
        </h2>
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </div>
  );
}
