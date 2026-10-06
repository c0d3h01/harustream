import { Suspense, ViewTransition } from 'react';
import { ContinueWatchingRail } from '@/components/home/ContinueWatchingRail';
import { Shell } from '@/components/layout/Shell';
import { type HeroSlide, TmdbHero } from '@/components/tmdb/TmdbHero';
import { TmdbRails, type TmdbSection } from '@/components/tmdb/TmdbRails';
import { DirectionalTransition } from '@/components/transitions/DirectionalTransition';
import { ConfigNotice } from '@/components/ui/ConfigNotice';
import { asAppError } from '@/lib/errors';
import { getDetails, getRail } from '@/tmdb/catalog';

export const dynamic = 'force-dynamic';

function HomeRailsSkeleton() {
  return (
    <div className="content-gutter mt-8" aria-hidden="true">
      <div className="h-64 rounded-lg border border-border bg-card" />
    </div>
  );
}

async function HomeRails() {
  const [trendingMovies, trendingSeries, topMovies, topSeries, popularMovies] = await Promise.all([
    getRail('movie', 'trending'),
    getRail('tv', 'trending'),
    getRail('movie', 'topRated'),
    getRail('tv', 'topRated'),
    getRail('movie', 'popular'),
  ]);
  const sections: TmdbSection[] = [
    {
      key: 'trending-movies',
      eyebrow: 'Trending now',
      heading: 'Trending movies',
      items: trendingMovies.slice(0, 14),
    },
    {
      key: 'trending-series',
      heading: 'Trending series',
      items: trendingSeries.slice(0, 14),
    },
    { key: 'top-movies', heading: 'Top rated movies', items: topMovies.slice(0, 14) },
    { key: 'top-series', heading: 'Top rated series', items: topSeries.slice(0, 14) },
    { key: 'popular-movies', heading: 'Popular movies', items: popularMovies.slice(0, 14) },
  ];
  return <TmdbRails sections={sections} />;
}

export default async function Home() {
  let slides: HeroSlide[] = [];
  try {
    const trending = await getRail('movie', 'trending');
    const top = trending.slice(0, 5);
    const details = await Promise.all(
      top.map((entry) => getDetails('movie', entry.tmdbId).catch(() => null)),
    );
    slides = top.map((card, i) => ({ card, detail: details[i] ?? null }));
  } catch (error) {
    if (asAppError(error).code === 'CONFIG') {
      return (
        <Shell>
          <DirectionalTransition>
            <ConfigNotice />
          </DirectionalTransition>
        </Shell>
      );
    }
    throw error;
  }

  return (
    <Shell>
      <DirectionalTransition>
        <div>
          {slides.length > 0 ? <TmdbHero slides={slides} /> : null}
          <div className="content-gutter">
            <ContinueWatchingRail />
          </div>
          <Suspense
            fallback={
              <ViewTransition exit="slide-down" default="none">
                <HomeRailsSkeleton />
              </ViewTransition>
            }
          >
            <ViewTransition enter="slide-up" default="none">
              <div className="content-gutter">
                <HomeRails />
              </div>
            </ViewTransition>
          </Suspense>
        </div>
      </DirectionalTransition>
    </Shell>
  );
}
