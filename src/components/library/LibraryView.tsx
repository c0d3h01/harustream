'use client';

import Link from 'next/link';
import { useMemo, ViewTransition } from 'react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { MediaCard } from '@/components/ui/MediaCard';
import { localeHref, useLocale, useT } from '@/lib/i18n';
import { useLibrary, useSettings } from '@/lib/storage';

export function LibraryView() {
  const { settings } = useSettings();
  const library = useLibrary(settings.provider);
  // TMDB saves live in their own scope so history survives provider churn.
  const tmdbLibrary = useLibrary('tmdb');
  const t = useT();
  const { locale } = useLocale();
  const items = useMemo(() => {
    const seen = new Set<string>();
    return [...tmdbLibrary.items, ...library.items].filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, [tmdbLibrary.items, library.items]);
  return (
    <section className="pt-8 sm:pt-12 lg:pt-16">
      <div className="glass-subtle flex flex-col justify-between gap-5 rounded-[1.5rem] border border-border/60 p-5 pb-6 sm:flex-row sm:items-end sm:p-7">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
            {t('library.eyebrow')}
          </p>
          <h1 className="mt-2 text-4xl font-bold tracking-[-0.04em]">{t('library.heading')}</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {t('library.savedCount', { count: items.length })}
          </p>
        </div>
        <div className="flex gap-2 text-xs font-semibold text-muted-foreground">
          <span className="glass-chip rounded-full px-3 py-2 text-primary">Watchlist</span>
          <span className="glass-chip rounded-full px-3 py-2">Continue watching</span>
        </div>
      </div>
      {items.length ? (
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-6">
          {items.map((item) => {
            // TMDB saves link back to TMDB detail with TMDB art; legacy
            // provider saves keep the legacy title route.
            const tmdb =
              item.tmdbKind && item.tmdbId ? { kind: item.tmdbKind, id: item.tmdbId } : null;
            return (
              <ViewTransition key={item.id}>
                <MediaCard
                  item={{
                    id: item.id,
                    providerId: item.providerId,
                    providerName: item.providerName,
                    title: item.title,
                    displayTitle: item.displayTitle,
                    posterUrl: (tmdb ? item.tmdbPoster : undefined) ?? item.posterUrl,
                    ref: item.ref,
                  }}
                  href={tmdb ? localeHref(locale, `/${tmdb.kind}/${tmdb.id}`) : undefined}
                  sharePoster
                />
              </ViewTransition>
            );
          })}
        </div>
      ) : (
        <ViewTransition enter="fade-in" exit="fade-out" default="none">
          <EmptyState
            heading={t('library.emptyHeading')}
            hint={t('library.emptyHint')}
            action={
              <Button
                render={<Link href={localeHref(locale, '/search')} />}
                nativeButton={false}
                className="h-11 rounded-xl px-4 py-2.5 font-semibold transition-transform duration-150 active:scale-[0.98]"
              >
                {t('library.findTitle')}
              </Button>
            }
            className="mt-8"
          />
        </ViewTransition>
      )}
    </section>
  );
}
