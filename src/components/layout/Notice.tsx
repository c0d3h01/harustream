'use client';

import { X } from 'lucide-react';
import { motion } from 'motion/react';
import { DURATIONS, EASE } from '@/components/motion/transitions';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n';

type Props = {
  message: string;
  onDismiss: () => void;
};

export function Notice({ message, onDismiss }: Props) {
  const t = useT();
  return (
    // AnimatePresence in App drives enter/exit; slides down from the header.
    <motion.div
      role="status"
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: DURATIONS.base, ease: EASE }}
      className="mx-auto mt-3 flex max-w-3xl items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2.5 text-sm text-primary sm:mt-4 sm:gap-4 sm:px-4 sm:py-3"
    >
      <span className="min-w-0 flex-1">{message}</span>
      <Button
        size="icon-sm"
        variant="ghost"
        onClick={onDismiss}
        aria-label={t('notice.dismiss')}
        className="touch-target shrink-0"
      >
        <X className="size-4" />
      </Button>
    </motion.div>
  );
}
