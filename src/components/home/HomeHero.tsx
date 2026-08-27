'use client';

import { Play } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { localeHref, useLocale, useT } from '@/lib/i18n';

export function HomeHero() {
  const t = useT();
  const { locale } = useLocale();
  return (
    <section className="pt-16 sm:pt-24">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">
        {t('home.heroEyebrow')}
      </p>
      <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
        {t('home.heroHeading')}
      </h1>
      <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">{t('home.heroSub')}</p>
      <div className="mt-7 flex flex-col gap-2.5 sm:flex-row">
        <Button
          render={<Link href={localeHref(locale, '/search')} />}
          nativeButton={false}
          className="h-12 gap-2 rounded-xl px-6 font-semibold"
        >
          <Play className="size-4 fill-current" aria-hidden="true" />
          {t('home.heroCtaBrowse')}
        </Button>
        <Button
          variant="outline"
          render={<Link href={localeHref(locale, '/library')} />}
          nativeButton={false}
          className="h-12 gap-2 rounded-xl px-6 font-semibold"
        >
          {t('home.heroCtaLibrary')}
        </Button>
      </div>
    </section>
  );
}
