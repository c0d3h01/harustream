import { notFound } from 'next/navigation';
import { ViewTransition } from 'react';
import { Shell } from '@/components/layout/Shell';
import { TmdbConfigNotice } from '@/components/tmdb/TmdbConfigNotice';
import { TmdbMediaCard } from '@/components/tmdb/TmdbMediaCard';
import { DirectionalTransition } from '@/components/transitions/DirectionalTransition';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { asAppError } from '@/lib/errors';
import { hasLocale } from '@/lib/i18n';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { createTranslator } from '@/lib/i18n/dictionary';
import { discoverByWatchProvider, getWatchProviderList, type TmdbKind } from '@/tmdb/catalog';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ lang: string; kind: string; provider: string }> };

export default async function BrowseProviderPage({ params }: Props) {
  const { lang, kind, provider } = await params;
  if (!hasLocale(lang) || (kind !== 'movie' && kind !== 'tv')) notFound();
  const providerId = Number(provider);
  if (!Number.isInteger(providerId) || providerId <= 0) notFound();
  const tmdbKind = kind as TmdbKind;

  try {
    const [providers, items] = await Promise.all([
      getWatchProviderList(lang, tmdbKind),
      discoverByWatchProvider(lang, tmdbKind, providerId),
    ]);
    const current = providers.find((entry) => entry.id === providerId);
    const t = createTranslator(getDictionary(lang));
    const seen = new Set<string>();
    return (
      <Shell>
        <DirectionalTransition>
          <section aria-labelledby="browse-heading" className="pt-10 sm:pt-14">
            <SectionHeader
              eyebrow={t('tmdb.providersHeading')}
              heading={current?.name ?? `#${providerId}`}
              headingId="browse-heading"
              trailing={
                <span className="text-sm text-muted-foreground">
                  {t('home.titlesCount', { count: items.length })}
                </span>
              }
              className="mb-5"
            />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-6">
              {items.map((item, index) => {
                const dedupeKey = `${item.kind}:${item.tmdbId}`;
                const firstSeen = !seen.has(dedupeKey);
                seen.add(dedupeKey);
                return (
                  <ViewTransition key={item.tmdbId}>
                    <TmdbMediaCard card={item} priority={index < 4} sharePoster={firstSeen} />
                  </ViewTransition>
                );
              })}
            </div>
          </section>
        </DirectionalTransition>
      </Shell>
    );
  } catch (error) {
    if (asAppError(error).code === 'CONFIG') {
      return (
        <Shell>
          <DirectionalTransition>
            <TmdbConfigNotice />
          </DirectionalTransition>
        </Shell>
      );
    }
    throw error;
  }
}
