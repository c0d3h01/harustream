'use client';

import Link from 'next/link';
import { Card as MediaCard } from '@/components/home/Card';
import { Button } from '@/components/ui/button';
import { localeHref, useLocale, useT } from '@/lib/i18n';
import { useLibrary, useSettings } from '@/lib/storage';

export function LibraryView() {
  const { settings } = useSettings();
  const library = useLibrary(settings.provider);
  const t = useT();
  const { locale } = useLocale();
  return (
    <section className="pt-10 sm:pt-14">
      <div className="flex flex-col justify-between gap-5 border-b border-border/60 pb-8 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
            {t('library.eyebrow')}
          </p>
          <h1 className="mt-2 text-4xl font-bold tracking-[-0.04em]">{t('library.heading')}</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {t('library.savedCount', { count: library.items.length })}
          </p>
        </div>
        <div className="flex gap-2 text-xs font-semibold text-muted-foreground">
          <span className="rounded-full bg-primary/15 px-3 py-2 text-primary">Watchlist</span>
          <span className="rounded-full bg-secondary px-3 py-2">Continue watching</span>
        </div>
      </div>
      {library.items.length ? (
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-6">
          {library.items.map((item) => (
            <MediaCard key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <div className="mt-8 rounded-3xl border border-dashed border-border p-12 text-center">
          <p className="font-semibold">{t('library.emptyHeading')}</p>
          <p className="mt-2 text-sm text-muted-foreground">{t('library.emptyHint')}</p>
          <Button
            render={<Link href={localeHref(locale, '/search')} />}
            nativeButton={false}
            className="mt-5 h-11 rounded-xl px-4 py-2.5 font-semibold"
          >
            {t('library.findTitle')}
          </Button>
        </div>
      )}
    </section>
  );
}
