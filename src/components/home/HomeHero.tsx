'use client';

import { ArrowRight, Info, Play } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { localeHref, useLocale, useT } from '@/lib/i18n';

/**
 * Cinematic hero — distinctive visual identity.
 *
 * Palette: midnight base + cinematic amber accent (the brief's one justified risk).
 * Type: Geist deliberate — weight, tracking, and scale as treatment, not neutrality.
 * Layout: visual weight at top, informational sequence below, CTA at bottom.
 * Signature: drifting ambient orb — CSS-keyframe animation, reduced-motion respected via existing media query.
 *
 * The metadata sequence (year / rating / quality / genre) uses / separators because
 * order carries information the reader needs — not decorative numbered markers.
 */
export function HomeHero() {
  const t = useT();
  const { locale } = useLocale();

  return (
    <section
      className="hero-root relative -mx-4 min-h-[540px] overflow-hidden sm:-mx-6 lg:-mx-10 lg:min-h-[620px]"
      aria-labelledby="hero-heading"
    >
      {/* Signature: drifting ambient orb — CSS keyframe, graceful no-op in reduced motion */}
      <div
        className="hero-orb absolute top-[-20%] left-[-10%] size-[300px] rounded-full opacity-60 blur-[200px] animate-orb"
        aria-hidden="true"
      />
      <div
        className="absolute top-[10%] right-[10%] size-[120px] rounded-full opacity-40 blur-[160px]"
        aria-hidden="true"
      />

      {/* Backdrop: ambient glow + soft horizontal grade. Scroll-scaled via CSS. */}
      <div className="hero-backdrop absolute inset-0" aria-hidden="true">
        <div className="hero-glow absolute left-[55%] top-[30%] -ml-40 size-[30rem] rounded-full bg-primary/18 blur-[120px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_72%_38%,transparent_20%,var(--background)_100%),linear-gradient(90deg,var(--background)_8%,color-mix(in_oklch,var(--background)_72%,transparent)_46%,transparent_100%)]" />
      </div>

      <div className="hero-inner relative mx-auto flex min-h-[540px] max-w-[1440px] items-start px-4 pb-16 sm:px-10 sm:pb-20 lg:min-h-[620px]">
        <div className="max-w-2xl">
          <p
            className="hero-eyebrow glass-chip mb-5 inline-flex items-center gap-2 rounded-full px-3 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.3em] text-hero-accent"
            id="hero-eyebrow"
          >
            <span
              className="size-1.5 animate-pulse rounded-full bg-hero-accent"
              aria-hidden="true"
            />
            {t('home.heroEyebrow')}
          </p>

          <h1
            id="hero-heading"
            className="mt-2 text-[2.8rem] font-semibold leading-[1.05] tracking-[-0.03em] text-balance sm:text-5xl lg:text-[4.5rem] text-hero-primary"
          >
            {t('home.heroHeading')}
          </h1>

          <p
            className="hero-sub mt-3 max-w-xl text-base leading-relaxed text-hero-foreground sm:text-lg"
            id="hero-description"
          >
            {t('home.heroSub')}
          </p>

          <div className="hero-meta mt-6 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[12px] tracking-[0.05em] text-hero-muted">
            <span className="font-semibold text-hero-foreground">FEATURED</span>
            <span aria-hidden="true" className="mx-1 text-opacity-30">
              /
            </span>
            <span aria-hidden="true">2026</span>
            <span aria-hidden="true" className="mx-1 text-opacity-30">
              /
            </span>
            <span aria-hidden="true">16+</span>
            <span aria-hidden="true" className="mx-1 text-opacity-30">
              /
            </span>
            <span aria-hidden="true">4K</span>
            <span aria-hidden="true" className="mx-1 text-opacity-30">
              /
            </span>
            <span aria-hidden="true">Drama · Action</span>
          </div>

          <div className="hero-ctas mt-8 flex flex-wrap items-center gap-3">
            <Button
              render={<Link href={localeHref(locale, '/search')} />}
              nativeButton={false}
              className="rounded-full bg-hero-accent pl-5 pr-1.5 py-1.5 text-[0.95rem] font-semibold text-hero-foreground shadow-[0_12px_32px_-12px_rgba(0,0,0,0.4)] transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-hero-accent/90 active:scale-[0.98]"
            >
              <Play className="size-4 fill-current" />
              {t('home.heroCtaBrowse')}
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-black/15 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0.5 group-hover:-translate-y-[1px] group-hover:scale-105">
                <ArrowRight className="size-4" aria-hidden="true" />
              </span>
            </Button>
            <Button
              variant="ghost"
              className="glass-chip glass-interactive rounded-full h-auto gap-2.5 px-5 py-2.5 text-[0.95rem] font-semibold transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]"
            >
              <Info className="size-4" aria-hidden="true" />
              {t('home.heroCtaMoreInfo')}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
