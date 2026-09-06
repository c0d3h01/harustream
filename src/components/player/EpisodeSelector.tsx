'use client';

import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { EASE, SPRING_SOFT } from '@/components/motion/transitions';
import { useT } from '@/lib/i18n';
import type { Episode } from '@/types';

export interface EpisodeSelectorProps {
  open: boolean;
  episodes: readonly Episode[];
  activeEpisodeId: string;
  onSelect: (episode: Episode) => void;
  onClose: () => void;
}

export function EpisodeSelector({
  open,
  episodes,
  activeEpisodeId,
  onSelect,
  onClose,
}: EpisodeSelectorProps) {
  const t = useT();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector('[data-active="true"]');
    el?.scrollIntoView({ block: 'center', behavior: 'instant' });
  }, [open]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="glass-panel absolute inset-y-0 right-0 z-[70] flex w-[min(22rem,85vw)] flex-col rounded-l-3xl border-l-0"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={SPRING_SOFT}
          role="listbox"
          aria-label={t('player.episodePicker')}
        >
          <div className="glass-chip flex items-center justify-between rounded-none rounded-tl-3xl border-b-0 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
            <h2 className="text-sm font-semibold tracking-wide text-white">
              {t('title.episodes')}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
              aria-label={t('player.episodePicker')}
            >
              <X size={18} />
            </button>
          </div>
          <div
            ref={listRef}
            className="scrollbar-thin flex-1 overflow-y-auto overscroll-contain py-1"
          >
            {episodes.map((episode, index) => {
              const isActive = episode.id === activeEpisodeId;
              return (
                <motion.button
                  key={episode.id}
                  type="button"
                  data-active={isActive}
                  onClick={() => onSelect(episode)}
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
                    className={`flex h-7 w-7 flex-none items-center justify-center rounded-lg text-xs font-bold ${
                      isActive ? 'bg-white text-black' : 'bg-white/10 text-white/60'
                    }`}
                  >
                    {index + 1}
                  </span>
                  <span className="truncate text-sm font-medium">{episode.title}</span>
                </motion.button>
              );
            })}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
