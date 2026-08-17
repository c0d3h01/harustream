'use client';

import { type Episode, titleFor } from '@/lib/api/client';
import { cn } from '@/lib/utils';

type Props = {
  episodes: Episode[];
  activeEpisode: string;
  onSelect: (item: Episode) => void;
};

export function EpisodeList({ episodes, activeEpisode, onSelect }: Props) {
  if (episodes.length === 0) return null;
  return (
    <aside className="rounded-xl border border-border bg-card p-3 sm:p-4">
      <h2 className="mb-2 text-sm font-semibold sm:mb-3 sm:text-base">Episodes</h2>
      {/* Horizontal scroll on phones (many titles have long lists and a
          vertical list on a narrow viewport gets claustrophobic), vertical
          on md+. The list inside still scrolls vertically if it exceeds
          max-h. */}
      <div className="-mx-1 flex max-h-72 snap-x gap-2 overflow-x-auto px-1 sm:mx-0 sm:flex-col sm:overflow-x-visible sm:overflow-y-auto sm:px-0">
        {episodes.map((ep, i) => {
          const key = String(i + 1);
          const active = activeEpisode === key || activeEpisode === ep.title;
          return (
            <button
              key={ep.link}
              type="button"
              onClick={() => onSelect(ep)}
              className={cn(
                'touch-target shrink-0 snap-start rounded-lg px-3 py-2 text-left text-sm whitespace-nowrap sm:w-full sm:whitespace-normal',
                active ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary',
              )}
            >
              {key}. {titleFor(ep)}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
