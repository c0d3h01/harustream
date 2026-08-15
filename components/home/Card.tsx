'use client';

import { Play } from 'lucide-react';
import { memo } from 'react';
import { imageFor, type Media, titleFor } from '@/lib/api/client';
import { cn } from '@/lib/utils';

type Props = {
  item: Media;
  onOpen: (item: Media) => void;
  /** Caller-driven sizing seam. The card itself only sets `w-full` — the
   *  parent decides whether it's a 160px rail tile or a 1/2 grid cell.
   *  Every card uses the same 2:3 poster artwork so all rails stay the
   *  same height. */
  className?: string;
};

export function Card({ item, onOpen, className }: Props) {
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className={cn(
        'group block w-full shrink-0 overflow-hidden rounded-xl bg-secondary text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        className,
      )}
    >
      <div className="relative overflow-hidden aspect-[2/3]">
        {/* biome-ignore lint/performance/noImgElement: images are served unoptimized (next.config `images.unoptimized`), so next/image adds no value here. */}
        <img
          src={imageFor(item)}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 size-full object-cover transition duration-500 will-change-auto group-hover:scale-105 group-hover:will-change-transform motion-reduce:group-hover:scale-100 motion-reduce:transition-none"
          onError={(e) => {
            e.currentTarget.style.opacity = '0';
          }}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
        <span className="pointer-events-none absolute right-3 bottom-3 grid size-10 place-items-center rounded-full bg-primary text-primary-foreground opacity-0 transition-opacity group-hover:opacity-100">
          <Play className="size-4 fill-current" />
        </span>
      </div>
      <p className="mt-3 line-clamp-2 min-h-[2.5rem] px-0.5 text-sm font-semibold">
        {titleFor(item)}
      </p>
    </button>
  );
}

export const MemoCard = memo(Card);
