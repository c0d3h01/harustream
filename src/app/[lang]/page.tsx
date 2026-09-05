import { notFound } from 'next/navigation';
import { Suspense, ViewTransition } from 'react';
import { ContinueWatchingRail } from '@/components/home/ContinueWatchingRail';
import { Shell } from '@/components/layout/Shell';
import { TmdbConfigNotice } from '@/components/tmdb/TmdbConfigNotice';
import { type HeroSlide, TmdbHero } from '@/components/tmdb/TmdbHero';
import { TmdbRails, type TmdbSection } from '@/components/tmdb/TmdbRails';
import { WatchProviderRail } from '@/components/tmdb/WatchProviderRail';
import { DirectionalTransition } from '@/components/transitions/DirectionalTransition';
import { asAppError } from '@/lib/errors';
import { hasLocale } from '@/lib/i18n';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { createTranslator } from '@/lib/i18n/dictionary';
import {
  getMovieDetails,
  getPopular,
  getTopRated,
  getTrending,
  getWatchProviderList,
} from '@/tmdb/catalog';

export const dynamic = 'force-dynamic';

function HomeRailsSkeleton() {
  return <div className="glass-subtle mt-8 h-64 rounded-[1.5rem]" aria-hidden="true" />;
}

async function HomeRails({ lang }: { lang: string }) {
  const t = createTranslator(getDictionary(hasLocale(lang) ? lang : 'en'));
  const [trendingMovies, trendingSeries, topMovies, topSeries, popularMovies, providers] =
    await Promise.all([
      getTrending(lang, 'movie'),
      getTrending(lang, 'tv'),
      getTopRated(lang, 'movie'),
      getTopRated(lang, 'tv'),
      getPopular(lang, 'movie'),
      getWatchProviderList(lang, 'movie'),
    ]);
  const sections: TmdbSection[] = [
    {
      key: 'trending-movies',
      eyebrow: t('tmdb.trendingEyebrow'),
      heading: t('tmdb.trendingMovies'),
      items: trendingMovies.slice(0, 14),
    },
    {
      key: 'trending-series',
      eyebrow: t('tmdb.trendingEyebrow'),
      heading: t('tmdb.trendingSeries'),
      items: trendingSeries.slice(0, 14),
    },
    { key: 'top-movies', heading: t('tmdb.topMovies'), items: topMovies.slice(0, 14) },
    { key: 'top-series', heading: t('tmdb.topSeries'), items: topSeries.slice(0, 14) },
    { key: 'popular-movies', heading: t('tmdb.popularMovies'), items: popularMovies.slice(0, 14) },
  ];
  return (
    <>
      <WatchProviderRail kind="movie" providers={providers} />
      <TmdbRails sections={sections} />
    </>
  );
}

export default async function Home({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();

  // Hero carousel: top trending titles with details (logo, trailer) for
  // the active slide. Detail fetches run in parallel and are server-cached.
  let slides: HeroSlide[] = [];
  try {
    const trending = await getTrending(lang, 'movie');
    const top = trending.slice(0, 5);
    const details = await Promise.all(
      top.map((entry) => getMovieDetails(lang, entry.tmdbId).catch(() => null)),
    );
    slides = top.map((card, i) => ({ card, detail: details[i] ?? null }));
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

  return (
    <Shell>
      <DirectionalTransition>
        <div className="pt-2">
          {slides.length > 0 ? <TmdbHero slides={slides} /> : null}
          <ContinueWatchingRail />
          {/* Suspense reveal: skeleton slides down, rails slide up on data arrival. */}
          <Suspense
            fallback={
              <ViewTransition exit="slide-down" default="none">
                <HomeRailsSkeleton />
              </ViewTransition>
            }
          >
            <ViewTransition enter="slide-up" default="none">
              <HomeRails lang={lang} />
            </ViewTransition>
          </Suspense>
        </div>
      </DirectionalTransition>
    </Shell>
  );
}
