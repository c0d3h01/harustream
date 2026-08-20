'use client';

import { Bookmark, Play, Search } from 'lucide-react';
import { motion, useScroll, useTransform } from 'motion/react';
import Image from 'next/image';
import { type ReactNode, type RefObject, useRef } from 'react';
import { useIsFinePointer } from '@/components/motion/useIsFinePointer';
import { usePrefersReducedMotion } from '@/components/motion/usePrefersReducedMotion';
import { fadeIn, fadeUp, staggerContainer } from '@/components/motion/variants';
import { Button } from '@/components/ui/button';
import { imageFor, type Media, type Meta, shortTitleFor, titleFor } from '@/lib/api/client';
import { imageUrl } from '@/lib/media/images';
import { cn } from '@/lib/utils';

// Hoisted: created once instead of on every Hero render.
const YEAR_PATTERN = /\(?(19\d{2}|20\d{2})\)?/;
const RATING_PATTERN = /\s*\/\s*10$/i;

type Props = {
  item: Media | null;
  meta?: Meta;
  providerName: string;
  inLibrary: boolean;
  onPlay: (item: Media) => void;
  onToggleLibrary: (item: Media) => void;
  /** Preload the code-split player chunk while the user decides to watch. */
  onPreloadPlay?: () => void;
  /** Switch to the search view (its SearchBar autofocuses). */
  onSearch: () => void;
};

export function Hero({
  item,
  meta,
  providerName,
  inLibrary,
  onPlay,
  onToggleLibrary,
  onPreloadPlay,
  onSearch,
}: Props) {
  // Reduced-motion users get a flat opacity reveal (no stagger, no y drift);
  // MotionConfig already strips transforms, but dropping the variant here
  // also removes the per-child stagger delay entirely.
  const prefersReducedMotion = usePrefersReducedMotion();
  const childVariants = prefersReducedMotion ? fadeIn : fadeUp;

  // Touch devices don't need the cinematic scroll parallax — scroll-linked
  // transforms on a full-width, gradient-heavy layer are the #1 Android scroll
  // jank source. On coarse pointers the parallax wrapper (and its useScroll
  // listener) is not even mounted; the backdrop renders as a static layer.
  const finePointer = useIsFinePointer();
  const sectionRef = useRef<HTMLElement | null>(null);
  const parallaxEnabled = finePointer && !prefersReducedMotion;

  if (!item) return <HeroEmpty providerName={providerName} />;

  const type = meta?.type || item.type || 'movie';
  const rating = meta?.rating?.replace(RATING_PATTERN, '').trim();
  const yearMatch = titleFor({ title: meta?.title || item.title }).match(YEAR_PATTERN);

  return (
    <section
      ref={sectionRef}
      className={cn(
        'relative mt-4 overflow-hidden rounded-[1.5rem] border border-border/60 bg-card shadow-2xl shadow-background/40 sm:mt-6',
        'min-h-0 h-[clamp(320px,50svh,500px)]',
      )}
    >
      {/* Backdrop: Ken Burns settle on load + scroll parallax while leaving.
          On coarse pointers the parallax wrapper is skipped entirely so no
          scroll listener or per-frame transform work exists on phones. */}
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.45 }}
      >
        {parallaxEnabled ? (
          <ParallaxBackdrop targetRef={sectionRef}>
            <BackdropImage item={item} meta={meta} />
          </ParallaxBackdrop>
        ) : (
          <div className="absolute -inset-y-8 inset-x-0">
            <BackdropImage item={item} meta={meta} />
          </div>
        )}
      </motion.div>
      <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-background/10" />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-px bg-primary/60" />

      {/* Ambient glow — slow-drifting primary light behind the content. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 top-8 size-72 rounded-full bg-primary/15 blur-xl animate-orb sm:blur-3xl motion-reduce:animate-none pointer-coarse:animate-none" />
        <div className="absolute right-0 bottom-0 size-80 rounded-full bg-primary/10 blur-xl animate-orb sm:blur-3xl motion-reduce:animate-none pointer-coarse:animate-none [animation-delay:-5.5s]" />
      </div>

      {/* Top scrim keeps the brand pill and search button legible against
        the backdrop and the phone's status bar. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-background/70 to-transparent"
      />

      {/* Brand mark + search, floating over the hero's top corners. No top
        bar anymore — the dock owns navigation, so the hero carries the
        identity and the only inline action left (search). */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={prefersReducedMotion ? undefined : staggerContainer}
        className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-3 p-4 sm:p-6 lg:p-8"
      >
        <motion.div
          variants={childVariants}
          className="flex items-center gap-2.5 rounded-full border border-border/50 bg-background/55 py-1.5 pr-3.5 pl-1.5 backdrop-blur-md pointer-coarse:bg-background/80 pointer-coarse:backdrop-blur-none"
        >
          <Image
            src="/favicon/icon.png"
            alt=""
            width={24}
            height={24}
            className="size-6 rounded-md"
          />
          <span className="text-sm font-semibold tracking-tight text-foreground">harustream</span>
        </motion.div>
        <motion.button
          variants={childVariants}
          type="button"
          onClick={onSearch}
          aria-label="Search"
          className="touch-target grid size-10 place-items-center rounded-full border border-border/50 bg-background/55 text-muted-foreground backdrop-blur-md transition hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:scale-90 pointer-coarse:bg-background/80 pointer-coarse:backdrop-blur-none"
        >
          <Search className="size-5" />
        </motion.button>
      </motion.div>

      {/* Content sits at the bottom on phones, centered-left on larger screens. */}
      <motion.div
        className="relative flex h-full max-w-2xl flex-col justify-end gap-4 p-5 sm:gap-5 sm:p-10 lg:p-12"
        initial="hidden"
        animate="visible"
        variants={prefersReducedMotion ? undefined : staggerContainer}
      >
        <motion.div variants={childVariants} className="flex flex-wrap items-center gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-primary sm:text-xs">
            <span className="text-shimmer motion-reduce:animate-none pointer-coarse:animate-none">
              Featured on {providerName}
            </span>
          </p>
          <span className="text-[10px] text-muted-foreground sm:text-xs" aria-hidden="true">
            ·
          </span>
          <span className="rounded-full border border-border/60 bg-background/50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground backdrop-blur transition-colors hover:border-primary/40 sm:text-xs pointer-coarse:bg-background/75 pointer-coarse:backdrop-blur-none">
            {type === 'series' ? 'Series' : 'Movie'}
          </span>
          {yearMatch && (
            <span className="rounded-full border border-border/60 bg-background/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground backdrop-blur transition-colors hover:border-primary/40 sm:text-xs pointer-coarse:bg-background/75 pointer-coarse:backdrop-blur-none">
              {yearMatch[1]}
            </span>
          )}
          {rating && (
            <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary transition-colors hover:border-primary/50 sm:text-xs pointer-coarse:bg-primary/20 pointer-coarse:backdrop-blur-none">
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
            className="touch-target w-full justify-center transition-transform duration-200 ease-out hover:scale-[1.03] active:scale-[0.97] motion-reduce:transition-none motion-reduce:hover:scale-100 sm:w-auto"
            onClick={() => onPlay(item)}
            onMouseEnter={onPreloadPlay}
            onFocus={onPreloadPlay}
          >
            <Play className="size-4 fill-current" />
            Play now
          </Button>
          <Button
            size="lg"
            variant="secondary"
            className="touch-target w-full justify-center transition-transform duration-200 ease-out hover:scale-[1.03] active:scale-[0.97] motion-reduce:transition-none motion-reduce:hover:scale-100 sm:w-auto"
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

// Scroll-linked parallax wrapper: drifts the backdrop slower than the page
// and pulls it in as you scroll away. Only ever mounted on fine pointers
// (desktop) — on touch it would turn every scroll frame into a transform
// update on a full-width layer.
function ParallaxBackdrop({
  targetRef,
  children,
}: {
  targetRef: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const { scrollYProgress } = useScroll({
    target: targetRef,
    offset: ['start start', 'end start'],
  });
  const bgY = useTransform(scrollYProgress, [0, 1], ['0%', '16%']);
  const bgScale = useTransform(scrollYProgress, [0, 1], [1, 1.1]);

  return (
    <motion.div className="absolute -inset-y-8 inset-x-0" style={{ y: bgY, scale: bgScale }}>
      {children}
    </motion.div>
  );
}

function BackdropImage({ item, meta }: { item: Media; meta?: Meta }) {
  return (
    <div className="absolute inset-0 animate-kenburns motion-reduce:animate-none">
      {/* LCP element: priority preloads the backdrop through the optimizer. */}
      <Image
        src={imageUrl(imageFor({ image: meta?.image || item.image }))}
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover"
        onError={(e) => {
          e.currentTarget.style.opacity = '0';
        }}
      />
    </div>
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
