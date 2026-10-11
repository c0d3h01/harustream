'use client';

import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { Episode } from '@/types/media';

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
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector('[data-active="true"]');
    el?.scrollIntoView({ block: 'center', behavior: 'instant' });
  }, [open]);

  return (
    <div
      className={`fixed inset-y-0 right-0 z-drawer flex w-[min(22rem,85vw)] flex-col rounded-l-xl border border-r-0 border-border bg-card shadow-[0_24px_64px_-16px_rgba(23,23,26,0.25)] transition-transform duration-300 ease-out ${
        open ? 'translate-x-0' : 'pointer-events-none translate-x-full'
      }`}
      role="listbox"
      aria-label={'Episode'}
      aria-hidden={!open}
      inert={!open}
    >
      <div className="flex items-center justify-between border-b border-border px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
        <h2 className="text-sm font-semibold tracking-wide text-foreground">{'Episodes'}</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={'Close'}
          tabIndex={open ? undefined : -1}
        >
          <X size={18} />
        </button>
      </div>
      <div ref={listRef} className="scrollbar-thin flex-1 overflow-y-auto overscroll-contain py-1">
        {episodes.map((episode, index) => {
          const isActive = episode.id === activeEpisodeId;
          return (
            <button
              key={episode.id}
              type="button"
              role="option"
              aria-selected={isActive}
              data-active={isActive}
              onClick={() => onSelect(episode)}
              tabIndex={open ? undefined : -1}
              className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                isActive
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              }`}
            >
              <span
                className={`flex h-7 w-7 flex-none items-center justify-center rounded-md text-xs font-bold ${
                  isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                }`}
              >
                {index + 1}
              </span>
              <span className="truncate text-sm font-medium">{episode.title}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
