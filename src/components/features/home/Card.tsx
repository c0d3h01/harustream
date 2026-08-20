'use client';

import { Film, Play } from 'lucide-react';
import { motion, useMotionTemplate, useMotionValue, useSpring } from 'motion/react';
import Image from 'next/image';
import { memo, type PointerEvent } from 'react';
import { DURATIONS, EASE, SPRING } from '@/components/motion/transitions';
import { usePrefersReducedMotion } from '@/components/motion/usePrefersReducedMotion';
import { imageFor, type Media, titleFor } from '@/lib/api/client';
import { imageUrl } from '@/lib/media/images';
import { cn } from '@/lib/utils';

type Props = {
  item: Media;
  onOpen: (item: Media) => void;
  /** Caller-driven sizing seam. The card itself only sets `w-full` — the
   *  parent decides whether it's a 160px rail tile or a 1/2 grid cell.
   *  Every card uses the same 2:3 poster artwork so all rails stay the
   *  same height. */
  className?: string;
  /** Eager-load the poster (LCP): the first card of an above-the-fold rail
   *  should not wait for lazy loading. */
  priority?: boolean;
  /** Entrance stagger — cards reveal in sequence from left to right. The
   *  delay is capped so long grids don't feel sluggish to appear. */
  index?: number;
  /** Optional 0–100 watch progress — draws a thin bar under the poster
   *  (used by the library view). */
  progress?: number;
};

const YEAR_PATTERN = /\b(19\d{2}|20\d{2})\b/;

export function Card({ item, onOpen, className, priority = false, index = 0, progress }: Props) {
  const title = titleFor(item);
  const year = title.match(YEAR_PATTERN)?.[1];
  const type = item.type?.toLowerCase() === 'series' ? 'Series' : 'Movie';
  const artwork = imageUrl(imageFor(item));
  const prefersReducedMotion = usePrefersReducedMotion();

  // Cursor-following spotlight: a soft primary glow that trails the pointer
  // across the poster. Springs keep it from snapping; MotionConfig's
  // reducedMotion flattening means the hover lift vanishes for a11y users,
  // and we skip the pointer tracking entirely for them too.
  const spotX = useMotionValue(0);
  const spotY = useMotionValue(0);
  const smoothX = useSpring(spotX, { stiffness: 320, damping: 28 });
  const smoothY = useSpring(spotY, { stiffness: 320, damping: 28 });
  const spotlight = useMotionTemplate`radial-gradient(320px circle at ${smoothX}px ${smoothY}px, color-mix(in oklch, var(--primary) 13%, transparent), transparent 65%)`;

  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    // Only track fine pointers — a touch-drag on a card must not run
    // getBoundingClientRect + spring updates per move event.
    if (prefersReducedMotion || event.pointerType !== 'mouse') return;
    const rect = event.currentTarget.getBoundingClientRect();
    spotX.set(event.clientX - rect.left);
    spotY.set(event.clientY - rect.top);
  };

  return (
    <motion.button
      type="button"
      onClick={() => onOpen(item)}
      onPointerMove={onPointerMove}
      className={cn(
        'group block w-full shrink-0 overflow-hidden rounded-2xl border border-border/70 bg-card text-left shadow-xs transition-shadow focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden hover:shadow-xl hover:shadow-primary/10',
        className,
      )}
      // Entrance + hover lift. Transform/opacity only; reduced-motion users
      // get the opacity fade and no lift (MotionConfig handles that). The
      // stagger delay lives inside `animate` so hover is never delayed.
      initial={{ opacity: 0, y: 8 }}
      animate={{
        opacity: 1,
        y: 0,
        transition: {
          duration: DURATIONS.base,
          ease: EASE,
          delay: Math.min(index * 0.04, 0.35),
        },
      }}
      whileHover={{ y: -5, transition: SPRING }}
    >
      <div className="relative overflow-hidden aspect-[2/3]">
        {artwork ? (
          <Image
            src={artwork}
            alt=""
            fill
            priority={priority}
            sizes="(min-width: 640px) 160px, 38vw"
            className="object-cover transition duration-500 will-change-auto group-hover:scale-105 motion-reduce:group-hover:scale-100 motion-reduce:transition-none"
            onError={(e) => {
              e.currentTarget.style.opacity = '0';
            }}
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-secondary to-secondary/60 text-muted-foreground">
            <Film className="size-8 opacity-60 transition-transform duration-500 group-hover:scale-110" />
          </div>
        )}
        {/* Cursor spotlight (above the artwork, below the metadata chips). */}
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 pointer-coarse:hidden"
          style={{ background: spotlight }}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100 pointer-coarse:hidden" />
        {progress !== undefined && progress > 0 && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-background/70"
          >
            <div
              className="h-full rounded-r-full bg-primary"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        )}
        <motion.span
          className="pointer-events-none absolute right-3 bottom-3 grid size-10 place-items-center rounded-full bg-primary text-primary-foreground opacity-0 shadow-lg transition-opacity group-hover:opacity-100 pointer-coarse:hidden"
          whileHover={{ scale: 1.15 }}
          transition={SPRING}
        >
          <Play className="size-4 fill-current" />
        </motion.span>
        <div className="absolute top-3 left-3 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-1.5">
          <span className="rounded-md border border-border/60 bg-background/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-foreground backdrop-blur">
            {type}
          </span>
          {item.providerName && (
            <span className="max-w-32 truncate rounded-md border border-primary/30 bg-primary/85 px-2 py-1 text-[10px] font-semibold text-primary-foreground shadow-xs">
              {item.providerName}
            </span>
          )}
        </div>
      </div>
      <div className="flex min-h-[5.5rem] flex-col gap-2 p-3">
        <p className="line-clamp-2 text-sm font-semibold leading-5 text-foreground">{title}</p>
        <div className="mt-auto flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
          {year && <span>{year}</span>}
          {year && <span aria-hidden="true">·</span>}
          <span>{type}</span>
          <span className="ml-auto text-primary transition-colors group-hover:text-primary/80">
            View details
          </span>
        </div>
      </div>
    </motion.button>
  );
}

export const MemoCard = memo(Card);
