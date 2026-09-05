'use client';

import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n';

type Props = {
  message: string;
  onDismiss: () => void;
};

export function Notice({ message, onDismiss }: Props) {
  const t = useT();
  return (
    // Static on render — no entrance motion. Dismiss is the interaction:
    // the parent removes this node (optionally inside a `<ViewTransition>`
    // with exit="fade-out" for a smooth leave).
    <div
      role="status"
      className="glass-card mx-auto mt-3 flex max-w-3xl items-center justify-between gap-3 rounded-2xl px-3 py-2.5 text-sm sm:mt-4 sm:gap-4 sm:px-4 sm:py-3"
    >
      <span className="min-w-0 flex-1">{message}</span>
      <Button
        size="icon-sm"
        variant="ghost"
        onClick={onDismiss}
        aria-label={t('notice.dismiss')}
        className="touch-target shrink-0 transition-transform duration-200 active:scale-90"
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}
