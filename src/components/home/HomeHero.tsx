'use client';

import { Info, Play, Plus } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { localeHref, useLocale, useT } from '@/lib/i18n';

export function HomeHero() {
  const t = useT();
  const { locale } = useLocale();

  return (
    <section
      className="relative -mx-4 min-h-[520px] overflow-hidden sm:-mx-6 lg:-mx-10"
      aria-labelledby="hero-heading"
    >
      <div
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_35%,color-mix(in_oklch,var(--primary)_22%,transparent),transparent_38%),linear-gradient(90deg,var(--background)_8%,color-mix(in_oklch,var(--background)_70%,transparent)_48%,transparent_100%)]"
        aria-hidden="true"
      />
      <div className="relative mx-auto flex min-h-[520px] max-w-[1440px] items-end px-4 pb-14 sm:px-10 sm:pb-20">
        <div className="max-w-2xl">
          <p
            className="mb-4 text-xs font-bold uppercase tracking-[0.24em] text-primary"
            id="hero-eyebrow"
          >
            {t('home.heroEyebrow')}
          </p>
          <h1
            id="hero-heading"
            className="mt-2 max-w-2xl text-4xl font-bold leading-[1.05] tracking-[-0.04em] text-balance sm:text-6xl lg:text-7xl"
          >
            {t('home.heroHeading')}
          </h1>
          <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">Featured</span>
            <span aria-hidden="true">2026</span>
            <span aria-hidden="true">16+</span>
            <span aria-hidden="true">4K</span>
            <span aria-hidden="true">Drama · Action</span>
          </div>
          <p
            className="mt-4 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg"
            id="hero-description"
          >
            {t('home.heroSub')}
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button
              render={<Link href={localeHref(locale, '/search')} />}
              nativeButton={false}
              className="h-12 gap-2 rounded-lg px-6 font-bold"
              aria-label={t('home.heroCtaBrowse')}
            >
              <Play className="size-4 fill-current" aria-hidden="true" />
              {t('home.heroCtaBrowse')}
            </Button>
            <Button
              variant="secondary"
              render={<Link href={localeHref(locale, '/library')} />}
              nativeButton={false}
              className="h-12 gap-2 rounded-lg px-6 font-bold"
              aria-label={t('home.heroCtaLibrary')}
            >
              <Plus className="size-4" aria-hidden="true" />
              {t('home.heroCtaLibrary')}
            </Button>
            <Button
              variant="ghost"
              className="h-12 gap-2 rounded-lg px-5"
              aria-label={t('home.heroCtaMoreInfo')}
            >
              <Info className="size-4" aria-hidden="true" />
              {t('home.heroCtaMoreInfo')}
            </Button>
          </div>
        </div>
      </div>
      <div
        className="absolute right-6 bottom-8 hidden items-center gap-2 text-xs text-muted-foreground sm:flex"
        aria-hidden="true"
      >
        <span className="size-2 rounded-full bg-primary" aria-hidden="true" />
        <span className="size-2 rounded-full bg-muted-foreground/40" aria-hidden="true" />
        <span className="size-2 rounded-full bg-muted-foreground/40" aria-hidden="true" />
      </div>
    </section>
  );
}
