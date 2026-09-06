'use client';

import { AlertTriangle, Server, X } from 'lucide-react';
// Explicit, manual channel/quality switcher. Nothing in this file ever
// selects a variant automatically — every switch is a deliberate click.
// The only "automation" here is a session-local health hint (which
// variants have already errored out this playback session), shown as a
// visual cue so the user can make an informed choice, never as a reason to
// pick for them.
import { AnimatePresence, motion } from 'motion/react';
import { EASE, SPRING_SOFT } from '@/components/motion/transitions';
import { useT } from '@/lib/i18n';
import type { StreamVariant } from '@/types';

export interface SourceSelectorProps {
  open: boolean;
  variants: readonly StreamVariant[];
  activeVariantId: string;
  failedVariantIds: ReadonlySet<string>;
  onSelect: (variantId: string) => void;
  onClose: () => void;
}

export function SourceSelector({
  open,
  variants,
  activeVariantId,
  failedVariantIds,
  onSelect,
  onClose,
}: SourceSelectorProps) {
  const t = useT();
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="glass-panel fixed inset-y-0 right-0 z-[70] flex w-[min(22rem,85vw)] flex-col rounded-l-3xl border-l-0"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={SPRING_SOFT}
          role="listbox"
          aria-label={t('player.sourcePicker')}
        >
          <div className="flex items-center justify-between border-b border-[var(--glass-border)] px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
            <h2 className="text-sm font-semibold tracking-wide text-white">
              {t('player.sourcePicker')}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
              aria-label={t('player.sourcePicker')}
            >
              <X size={18} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain py-1">
            {variants.map((variant, index) => {
              const key = `${variant.providerId}:${variant.variantId}`;
              const isActive = variant.variantId === activeVariantId;
              const failed = failedVariantIds.has(variant.variantId);
              return (
                <motion.button
                  key={key}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  onClick={() => onSelect(variant.variantId)}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                    isActive
                      ? 'bg-white/12 text-white'
                      : 'text-white/70 hover:bg-white/8 hover:text-white'
                  }`}
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2, delay: Math.min(index * 0.03, 0.3), ease: EASE }}
                >
                  <span
                    className={`flex h-8 w-8 flex-none items-center justify-center rounded-lg ${
                      isActive ? 'bg-white/20 text-white' : 'bg-white/8 text-white/50'
                    }`}
                  >
                    {failed ? (
                      <AlertTriangle size={14} className="text-amber-400" />
                    ) : (
                      <Server size={14} />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{variant.label}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-white/40">
                      <span className="font-mono uppercase">{variant.providerId}</span>
                      {variant.quality ? (
                        <>
                          <span>·</span>
                          <span>{variant.quality}</span>
                        </>
                      ) : null}
                      <span>·</span>
                      <span className="uppercase">{variant.format}</span>
                      {failed ? (
                        <>
                          <span>·</span>
                          <span className="text-amber-400">failed earlier</span>
                        </>
                      ) : null}
                    </div>
                  </div>
                  {isActive ? (
                    <motion.div
                      className="h-2 w-2 flex-none rounded-full bg-emerald-400"
                      layoutId="active-variant-dot"
                      transition={SPRING_SOFT}
                    />
                  ) : null}
                </motion.button>
              );
            })}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
