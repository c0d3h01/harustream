'use client';

import { Bookmark, Play } from 'lucide-react';
import { motion } from 'motion/react';
import { usePrefersReducedMotion } from '@/components/motion/usePrefersReducedMotion';
import { fadeIn, fadeUp, staggerContainer } from '@/components/motion/variants';
import { Button } from '@/components/ui/button';
import { imageFor, type Media, type Meta, shortTitleFor, titleFor } from '@/lib/api/client';
import { cn } from '@/lib/utils';

// Hoisted: created once instead of on every Hero render.
const YEAR_PATTERN = /\(?(19\d{2}|20\d{2})\)?/;

type Props = {
  item: Media | null;
  meta?: Meta;
  providerName: string;
  inLibrary: boolean;
  onPlay: (item: Media) => void;
  onToggleLibrary: (item: Media) => void;
};

export function Hero({ item, meta, providerName, inLibrary, onPlay, onToggleLibrary }: Props) {
  // Reduced-motion users get a flat opacity reveal (no stagger, no y drift);
  // MotionConfig already strips transforms, but dropping the variant here
  // also removes the per-child stagger delay entirely.
  const prefersReducedMotion = usePrefersReducedMotion();
  const childVariants = prefersReducedMotion ? fadeIn : fadeUp;

  if (!item) return <HeroEmpty providerName={providerName} />;

  const type = meta?.type || item.type || 'movie';
  const rating = meta?.rating?.replace(/\s*\/\s*10$/i, '').trim();
  const yearMatch = titleFor({ title: meta?.title || item.title }).match(YEAR_PATTERN);

  return (
    <section
      className={cn(
        'relative mt-4 overflow-hidden rounded-[1.5rem] border border-border/60 bg-card shadow-2xl shadow-background/40 sm:mt-6',
        'min-h-0 h-[clamp(320px,50svh,500px)]',
      )}
    >
      {/* biome-ignore lint/performance/noImgElement: images are served unoptimized (next.config `images.unoptimized`), so next/image adds no value here. */}
      <motion.img
        src={imageFor({ image: meta?.image || item.image })}
        alt=""
        fetchPriority="high"
        className="absolute inset-0 size-full object-cover"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.45 }}
        onError={(e) => {
          e.currentTarget.style.opacity = '0';
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-background/10" />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-px bg-primary/60" />

      {/* Content sits at the bottom on phones, centered-left on larger screens. */}
      <motion.div
        className="relative flex h-full max-w-2xl flex-col justify-end gap-4 p-5 sm:gap-5 sm:p-10 lg:p-12"
        initial="hidden"
        animate="visible"
        variants={prefersReducedMotion ? undefined : staggerContainer}
      >
        <motion.div variants={childVariants} className="flex flex-wrap items-center gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-primary sm:text-xs">
            Featured on {providerName}
          </p>
          <span className="text-[10px] text-muted-foreground sm:text-xs" aria-hidden="true">
            ·
          </span>
          <span className="rounded-full border border-border/60 bg-background/50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground backdrop-blur sm:text-xs">
            {type === 'series' ? 'Series' : 'Movie'}
          </span>
          {yearMatch && (
            <span className="rounded-full border border-border/60 bg-background/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground backdrop-blur sm:text-xs">
              {yearMatch[1]}
            </span>
          )}
          {rating && (
            <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary sm:text-xs">
              ★ {rating}
            </span>
          )}
        </motion.div>
        <motion.h1
          variants={childVariants}
          className="line-clamp-2 text-balance text-[clamp(1.5rem,3.5vw,2.5rem)] font-semibold tracking-tight leading-tight"
        >
          {shortTitleFor({ title: meta?.title || item.title })}
        </motion.h1>
        <motion.p
          variants={childVariants}
          className="mt-1 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-3"
        >
          <Button
            size="lg"
            className="touch-target w-full justify-center sm:w-auto"
            onClick={() => onPlay(item)}
          >
            <Play className="size-4 fill-current" />
            Play now
          </Button>
          <Button
            size="lg"
            variant="secondary"
            className="touch-target w-full justify-center sm:w-auto"
            onClick={() => onToggleLibrary(item)}
          >
            <Bookmark className="size-4" />
            {inLibrary ? 'Saved' : 'Add to list'}
          </Button>
        </motion.p>
      </motion.div>
    </section>
  );
}

function HeroEmpty({ providerName }: { providerName: string }) {
  return (
    <section className="mt-4 grid h-[clamp(320px,50svh,500px)] min-h-0 place-items-center rounded-2xl border border-dashed border-border bg-card/40 p-6 text-center sm:mt-5 sm:p-8">
      <div>
        <p className="text-sm font-semibold text-primary">{providerName}</p>
        <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Nothing loaded yet</h1>
        <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
          The home screen is powered by live provider data only. Search for a title or try again
          when the provider is available.
        </p>
      </div>
    </section>
  );
}
