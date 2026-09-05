'use client';

import { Calendar, Check, Plus, Star, Volume2, VolumeX } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { localeHref, useLocale, useT } from '@/lib/i18n';
import { imageUrl } from '@/lib/media/images';
import { useLibrary } from '@/lib/storage';
import type { TmdbCard, TmdbDetail } from '@/tmdb/catalog';
import { tmdbImageUrl } from '@/tmdb/images';
import { AmbientBackdrop } from './AmbientBackdrop';
import { tmdbPath } from './TmdbMediaCard';
import { TmdbPlayButton } from './TmdbPlayButton';
import { TrailerEmbed } from './TrailerEmbed';

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

/** Trending carousel — full-bleed slides with crossfade, dots, and a muted
 *  looping trailer on the active slide (paused off-screen, poster-only for
 *  reduced-motion, which also disables rotation). Page-wide ambient
 *  backdrop follows the active slide. */
export function TmdbHero({ slides }: TmdbHeroProps) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  // Shared by the active trailer and its mute toggle (remounts the embed
  // on toggle — position loss is invisible on a looping backdrop).
  const [trailerMuted, setTrailerMuted] = useState(true);

  const count = slides.length;
  const safeIndex = count === 0 ? 0 : Math.min(index, count - 1);
  const active = slides[safeIndex] as HeroSlide | undefined;
  const reduceMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (count < 2 || paused || reduceMotion) return;
    const id = window.setInterval(() => {
      if (!document.hidden) setIndex((i) => (i + 1) % count);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [count, paused, reduceMotion]);

  if (!active) return null;

  const activeTrailerKey = active.detail?.trailers?.[0]?.key;
  const headingId = `hero-heading-${active.card.kind}-${active.card.tmdbId}`;

  return (
    <section
      className="hero-root relative -mx-4 min-h-[600px] overflow-hidden rounded-b-[2rem] border border-white/10 sm:-mx-6 sm:min-h-[640px] sm:rounded-b-[2.5rem] lg:-mx-10 lg:min-h-[700px]"
      aria-roledescription="carousel"
      aria-labelledby={headingId}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {active.card.backdropPath ? (
        <AmbientBackdrop
          key={headingId}
          src={tmdbImageUrl(active.card.backdropPath, 'w780') ?? active.card.backdropPath}
        />
      ) : null}

      {slides.map((slide, i) => (
        <HeroSlideView
          key={`${slide.card.kind}:${slide.card.tmdbId}`}
          slide={slide}
          active={i === safeIndex}
          headingId={`hero-heading-${slide.card.kind}-${slide.card.tmdbId}`}
          eager={i === 0}
          trailerMuted={trailerMuted}
        />
      ))}

      {activeTrailerKey ? (
        <HeroMuteToggle muted={trailerMuted} onToggle={() => setTrailerMuted((m) => !m)} />
      ) : null}

      {count > 1 && !reduceMotion ? (
        <div className="absolute right-4 bottom-6 z-10 flex items-center gap-1 sm:right-10">
          {slides.map((slide, i) => {
            const selected = i === safeIndex;
            return (
              <button
                key={`${slide.card.kind}:${slide.card.tmdbId}`}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Go to slide ${i + 1}: ${slide.card.title}`}
                aria-current={selected}
                className="grid size-8 cursor-pointer place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  aria-hidden="true"
                  className={[
                    'block h-1.5 rounded-full transition-all duration-300',
                    selected ? 'w-6 bg-white' : 'w-1.5 bg-white/40 hover:bg-white/70',
                  ].join(' ')}
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
  trailerMuted,
}: {
  slide: HeroSlide;
  active: boolean;
  headingId: string;
  eager: boolean;
  trailerMuted: boolean;
}) {
  const { card, detail } = slide;
  const trailerKey = detail?.trailers?.[0]?.key;
  const backdropSrc = card.backdropPath ? tmdbImageUrl(card.backdropPath, 'w1280') : undefined;
  return (
    <div
      className={[
        'absolute inset-0 transition-opacity duration-700 motion-reduce:transition-none',
        active ? 'z-[1] opacity-100' : 'pointer-events-none z-0 opacity-0',
      ].join(' ')}
      aria-hidden={!active}
      inert={!active}
    >
      <div className="hero-backdrop absolute inset-0">
        <div className="hero-glow absolute left-[55%] top-[30%] -ml-40 size-[30rem] rounded-full bg-primary/18 blur-[120px]" />
        {backdropSrc ? (
          <Image
            src={imageUrl(backdropSrc)}
            alt=""
            fill
            priority={eager}
            sizes="100vw"
            className="object-cover object-top opacity-60"
          />
        ) : null}
        {trailerKey && active ? (
          <TrailerEmbed trailerKey={trailerKey} muted={trailerMuted} />
        ) : null}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_72%_38%,transparent_20%,var(--background)_100%),linear-gradient(90deg,var(--background)_8%,color-mix(in_oklch,var(--background)_72%,transparent)_46%,transparent_100%)]" />
      </div>

      <div className="hero-inner relative mx-auto flex min-h-[600px] max-w-[1440px] items-end px-5 pb-20 sm:min-h-[640px] sm:px-10 sm:pb-24 lg:min-h-[700px] lg:px-14">
        <div className="max-w-2xl">
          <HeroEyebrow />
          {detail?.logoPath ? (
            <div className="relative mt-2 h-24 w-64 sm:h-28 sm:w-80" aria-hidden="true">
              <Image
                src={imageUrl(tmdbImageUrl(detail.logoPath, 'w500'))}
                alt=""
                fill
                priority={eager}
                sizes="(min-width: 640px) 20rem, 16rem"
                className="object-contain object-left"
              />
            </div>
          ) : null}
          <h1
            id={headingId}
            className={
              detail?.logoPath
                ? 'sr-only'
                : 'mt-3 max-w-3xl text-[2.75rem] font-bold leading-[0.94] tracking-[-0.06em] text-balance sm:text-7xl lg:text-[5.75rem]'
            }
          >
            {card.title}
          </h1>

          <div className="hero-meta mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium text-foreground/90">
            {card.rating > 0 ? (
              <span className="inline-flex items-center gap-1.5">
                <Star className="size-4 fill-amber-400 text-amber-400" aria-hidden="true" />
                {card.rating.toFixed(1)}/10
              </span>
            ) : null}
            {card.year ? (
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="size-4 text-foreground/60" aria-hidden="true" />
                {card.year}
              </span>
            ) : null}
            {detail && detail.genres.length > 0 ? (
              <span className="text-foreground/80">{detail.genres.slice(0, 2).join(' · ')}</span>
            ) : null}
          </div>

          {(detail?.overview || card.overview) && (
            <p className="hero-sub mt-4 line-clamp-3 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
              {detail?.overview || card.overview}
            </p>
          )}

          <div className="hero-ctas mt-7 flex flex-wrap items-center gap-3">
            <TmdbPlayButton
              kind={card.kind}
              tmdbId={card.tmdbId}
              title={card.title}
              originalTitle={card.originalTitle}
              year={card.year}
              variant="hero"
            />
            <HeroSaveButton card={card} />
            <HeroMoreInfo card={card} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Circular library toggle beside Play. */
function HeroSaveButton({ card }: { card: TmdbCard }) {
  const t = useT();
  const library = useLibrary('tmdb');
  const ref = `${card.kind}:${card.tmdbId}`;
  const saved = library.has(ref);
  const saveItem = useMemo(
    () => ({
      id: `tmdb:${ref}`,
      providerId: 'tmdb',
      providerName: 'TMDB',
      title: card.title,
      displayTitle: card.title,
      posterUrl: tmdbImageUrl(card.posterPath, 'w342'),
      ref,
      tmdbKind: card.kind,
      tmdbId: card.tmdbId,
      tmdbTitle: card.title,
      tmdbPoster: tmdbImageUrl(card.posterPath, 'w342'),
    }),
    [card, ref],
  );
  return (
    <button
      type="button"
      onClick={() => library.toggle(saveItem)}
      aria-pressed={saved}
      aria-label={saved ? t('title.saved') : t('title.save')}
      className="glass-chip glass-interactive grid size-11 cursor-pointer place-items-center rounded-full text-foreground transition-all duration-150 hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {saved ? (
        <Check className="size-5" aria-hidden="true" />
      ) : (
        <Plus className="size-5" aria-hidden="true" />
      )}
    </button>
  );
}

/** 44px sound toggle for the banner trailer (bottom-right, clear of CTAs). */
function HeroMuteToggle({ muted, onToggle }: { muted: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={!muted}
      aria-label={muted ? 'Unmute banner trailer' : 'Mute banner trailer'}
      className="glass-chip absolute right-4 bottom-16 z-10 grid size-11 cursor-pointer place-items-center rounded-full text-foreground transition-all duration-150 hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:right-10"
    >
      {muted ? (
        <VolumeX className="size-5" aria-hidden="true" />
      ) : (
        <Volume2 className="size-5" aria-hidden="true" />
      )}
    </button>
  );
}

function HeroEyebrow() {
  const t = useT();
  return (
    <p className="hero-eyebrow glass-chip mb-5 inline-flex items-center gap-2 rounded-full px-3 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-primary">
      <span className="size-1.5 animate-pulse rounded-full bg-primary" aria-hidden="true" />
      {t('tmdb.heroEyebrow')}
    </p>
  );
}

function HeroMoreInfo({ card }: { card: TmdbCard }) {
  const t = useT();
  const { locale } = useLocale();
  return (
    <Button
      render={<Link href={localeHref(locale, tmdbPath(card.kind, card.tmdbId))} />}
      nativeButton={false}
      variant="ghost"
      className="glass-chip glass-interactive h-auto gap-2.5 rounded-full px-5 py-2.5 text-[0.95rem] font-semibold transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]"
    >
      {t('home.heroCtaMoreInfo')}
    </Button>
  );
}
