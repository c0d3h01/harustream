'use client';

import { Play } from 'lucide-react';
import { motion } from 'motion/react';
import { memo } from 'react';
import { DURATIONS, EASE } from '@/components/motion/transitions';
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

const YEAR_PATTERN = /\b(19\d{2}|20\d{2})\b/;

export function Card({ item, onOpen, className }: Props) {
  const title = titleFor(item);
  const year = title.match(YEAR_PATTERN)?.[1];
  const type = item.type?.toLowerCase() === 'series' ? 'Series' : 'Movie';

  return (
    <motion.button
      type="button"
      onClick={() => onOpen(item)}
      className={cn(
        'group block w-full shrink-0 overflow-hidden rounded-2xl border border-border/70 bg-card text-left shadow-sm transition-shadow focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none hover:shadow-xl hover:shadow-background/30',
        className,
      )}
      // Entrance + hover lift. Transform/opacity only; reduced-motion users
      // get the opacity fade and no lift (MotionConfig handles that).
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={{ duration: DURATIONS.base, ease: EASE }}
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
        <span className="pointer-events-none absolute right-3 bottom-3 grid size-10 place-items-center rounded-full bg-primary text-primary-foreground opacity-0 shadow-lg transition-all group-hover:scale-105 group-hover:opacity-100">
          <Play className="size-4 fill-current" />
        </span>
        <span className="absolute top-3 left-3 rounded-md border border-border/60 bg-background/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-foreground backdrop-blur">
          {type}
        </span>
      </div>
      <div className="flex min-h-[5.5rem] flex-col gap-2 p-3">
        <p className="line-clamp-2 text-sm font-semibold leading-5 text-foreground">{title}</p>
        <div className="mt-auto flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
          {year && <span>{year}</span>}
          {year && <span aria-hidden="true">·</span>}
          <span>{type}</span>
          <span className="ml-auto text-primary">View details</span>
        </div>
      </div>
    </motion.button>
  );
}

export const MemoCard = memo(Card);
