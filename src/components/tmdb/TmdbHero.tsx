'use client';

import { Calendar, Check, Plus, Star } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { buttonClassName } from '@/components/ui/button';
import { imgUrl } from '@/lib/media';
import { tmdbPath } from '@/lib/routes';
import { useLibrary } from '@/lib/storage';
import { cn } from '@/lib/utils';
import type { TmdbCard, TmdbDetail } from '@/tmdb/catalog';
import { tmdbImageUrl } from '@/tmdb/images';
import { SourcePicker } from '../sources/SourcePicker';
import { tmdbSaveItem } from './saveItem';

export interface HeroSlide {
  card: TmdbCard;
  detail: Pick<
    TmdbDetail,
    'logoPath' | 'genres' | 'overview' | 'rating' | 'runtime' | 'trailers'
  > | null;
}

interface TmdbHeroProps {
  slides: HeroSlide[];
}

const ROTATE_MS = 8000;

export function TmdbHero({ slides }: TmdbHeroProps) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduceMotion(mq.matches);
    const onChange = (event: MediaQueryListEvent) => setReduceMotion(event.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const count = slides.length;
  const safeIndex = count === 0 ? 0 : Math.min(index, count - 1);
  const active = slides[safeIndex] as HeroSlide | undefined;

  useEffect(() => {
    if (count < 2 || paused || reduceMotion) return;
    const id = window.setInterval(() => {
      if (!document.hidden) setIndex((i) => (i + 1) % count);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [count, paused, reduceMotion]);

  if (!active) return null;

  const headingId = `hero-heading-${active.card.kind}-${active.card.tmdbId}`;

  return (
    <section
      className="hero-root relative w-full overflow-hidden bg-background min-h-[92svh] sm:min-h-[94svh]"
      aria-roledescription="carousel"
      aria-labelledby={headingId}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {active.card.backdropPath ? (
        <div
          key={headingId}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
        >
          <Image
            src={imgUrl(tmdbImageUrl(active.card.backdropPath, 'w780') ?? active.card.backdropPath)}
            alt=""
            fill
            priority
            sizes="100vw"
            className="scale-125 object-cover opacity-40 blur-[90px] saturate-[1.3]"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-transparent to-background" />
        </div>
      ) : null}

      {slides.map((slide, i) => (
        <HeroSlideView
          key={`${slide.card.kind}:${slide.card.tmdbId}`}
          slide={slide}
          active={i === safeIndex}
          headingId={`hero-heading-${slide.card.kind}-${slide.card.tmdbId}`}
          eager={i === 0}
        />
      ))}

      {count > 1 && !reduceMotion ? (
        <div className="absolute right-5 bottom-8 z-10 flex items-center gap-1 sm:right-10 lg:right-16">
          {slides.map((slide, i) => {
            const selected = i === safeIndex;
            return (
              <button
                key={`${slide.card.kind}:${slide.card.tmdbId}`}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Go to slide ${i + 1}: ${slide.card.title}`}
                aria-current={selected}
                className="grid size-8 cursor-pointer place-items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'block h-1.5 rounded-full transition-all duration-300',
                    selected ? 'w-6 bg-primary' : 'w-1.5 bg-foreground/30 hover:bg-foreground/55',
                  )}
                />
              </button>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function HeroSlideView({
  slide,
  active,
  headingId,
  eager,
}: {
  slide: HeroSlide;
  active: boolean;
  headingId: string;
  eager: boolean;
}) {
  const { card, detail } = slide;
  const backdropSrc = card.backdropPath ? tmdbImageUrl(card.backdropPath, 'w1280') : undefined;
  return (
    <div
      data-active={active}
      className={cn(
        'hero-slide absolute inset-0 transition-opacity duration-700 motion-reduce:transition-none',
        active ? 'z-page opacity-100' : 'pointer-events-none z-0 opacity-0',
      )}
      aria-hidden={!active}
      inert={!active}
    >
      <div className="hero-backdrop backdrop-fade-b absolute inset-0">
        {backdropSrc ? (
          <Image
            src={imgUrl(backdropSrc)}
            alt=""
            fill
            priority={eager}
            sizes="100vw"
            className="object-cover object-center"
          />
        ) : null}
      </div>

      <div className="hero-inner relative mx-auto flex min-h-[92svh] w-full max-w-[1600px] items-end px-5 pb-24 sm:min-h-[94svh] sm:px-10 sm:pb-28 lg:px-16">
        <div className="hero-content max-w-2xl [text-shadow:0_1px_12px_rgba(0,0,0,0.65)]">
          <HeroEyebrow />
          {detail?.logoPath ? (
            <div className="relative mt-2 h-24 w-64 sm:h-28 sm:w-80" aria-hidden="true">
              <Image
                src={imgUrl(tmdbImageUrl(detail.logoPath, 'w500'))}
                alt=""
                fill
                priority={eager}
                sizes="(min-width: 640px) 20rem, 16rem"
                className="object-contain object-left brightness-0 invert"
              />
            </div>
          ) : null}
          <h1
            id={headingId}
            className={
              detail?.logoPath
                ? 'sr-only'
                : 'mt-3 max-w-3xl font-heading text-5xl leading-[0.95] tracking-[-0.01em] text-balance sm:text-7xl lg:text-8xl'
            }
          >
            {card.title}
          </h1>

          <div className="hero-meta mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium text-foreground/85">
            {card.rating > 0 ? (
              <span className="inline-flex items-center gap-1.5">
                <Star className="size-4 fill-primary text-primary" aria-hidden="true" />
                {card.rating.toFixed(1)}/10
              </span>
            ) : null}
            {card.year ? (
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="size-4 text-muted-foreground" aria-hidden="true" />
                {card.year}
              </span>
            ) : null}
            {detail && detail.genres.length > 0 ? (
              <span className="text-muted-foreground">{detail.genres.slice(0, 2).join(', ')}</span>
            ) : null}
          </div>

          {(detail?.overview || card.overview) && (
            <p className="hero-sub mt-4 line-clamp-3 max-w-[36rem] text-base leading-7 text-muted-foreground sm:text-lg">
              {detail?.overview || card.overview}
            </p>
          )}

          {active ? (
            <div className="hero-ctas mt-7 flex flex-wrap items-center gap-3">
              <SourcePicker
                kind={card.kind}
                tmdbId={card.tmdbId}
                title={card.title}
                originalTitle={card.originalTitle}
                year={card.year}
                fallbackPosterUrl={
                  card.posterPath ? tmdbImageUrl(card.posterPath, 'w342') : undefined
                }
                presentation="popover"
              />
              <HeroSaveButton card={card} />
              <HeroMoreInfo card={card} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function HeroSaveButton({ card }: { card: TmdbCard }) {
  const library = useLibrary('tmdb');
  const ref = `${card.kind}:${card.tmdbId}`;
  const saved = library.has(ref);
  const saveItem = useMemo(
    () => tmdbSaveItem(card.kind, card.tmdbId, card.title, card.posterPath),
    [card],
  );
  return (
    <button
      type="button"
      onClick={() => library.toggle(saveItem)}
      aria-pressed={saved}
      aria-label={saved ? 'Saved' : 'Save'}
      className="grid size-12 cursor-pointer place-items-center rounded-md border border-border bg-background/75 text-foreground backdrop-blur-sm transition-all duration-150 hover:bg-card hover:border-input active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {saved ? (
        <Check className="size-5" aria-hidden="true" />
      ) : (
        <Plus className="size-5" aria-hidden="true" />
      )}
    </button>
  );
}

function HeroEyebrow() {
  return (
    <p className="hero-eyebrow mb-5 inline-flex items-center gap-2 font-mono text-[11px] font-medium tracking-[0.22em] text-muted-foreground uppercase">
      <span className="size-1.5 animate-pulse rounded-full bg-primary" aria-hidden="true" />
      {'Trending this week'}
    </p>
  );
}

function HeroMoreInfo({ card }: { card: TmdbCard }) {
  return (
    <Link
      href={tmdbPath(card.kind, card.tmdbId)}
      transitionTypes={['nav-forward']}
      className={buttonClassName({
        variant: 'outline',
        className:
          'h-12 gap-2.5 rounded-lg bg-background/75 px-6 text-[0.95rem] font-semibold backdrop-blur-sm',
      })}
    >
      {'More info'}
    </Link>
  );
}
