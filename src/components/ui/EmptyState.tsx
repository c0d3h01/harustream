import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// Shared empty-state card used when a list has zero items (library, search
// results, etc.). Keeps the dashed-border + centered text + optional CTA
// layout consistent across pages.

interface EmptyStateProps {
  /** Primary message. */
  heading: string;
  /** Secondary hint below the heading. */
  hint?: string;
  /** Optional call-to-action (typically a <Button>). */
  action?: ReactNode;
  /** Additional className on the wrapper. */
  className?: string;
}

export function EmptyState({ heading, hint, action, className }: EmptyStateProps) {
  return (
    <div className={cn('glass-subtle rounded-2xl border-dashed p-12 text-center', className)}>
      <p className="font-semibold">{heading}</p>
      {hint ? <p className="mt-2 text-sm text-muted-foreground">{hint}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
