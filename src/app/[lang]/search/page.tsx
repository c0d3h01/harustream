import { notFound } from 'next/navigation';
import { Suspense, ViewTransition } from 'react';
import { Shell } from '@/components/layout/Shell';
import { SearchBox } from '@/components/search/SearchBox';
import { SearchHero } from '@/components/search/SearchHero';
import { SearchSkeleton } from '@/components/search/SearchSkeleton';
import { TmdbConfigNotice } from '@/components/tmdb/TmdbConfigNotice';
import { TmdbSearchResults } from '@/components/tmdb/TmdbSearchResults';
import { DirectionalTransition } from '@/components/transitions/DirectionalTransition';
import { asAppError } from '@/lib/errors';
import { hasLocale } from '@/lib/i18n';
import { searchTmdb } from '@/tmdb/catalog';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ lang: string }>; searchParams: Promise<{ q?: string }> };

async function Results({ lang, query }: { lang: string; query: string }) {
  try {
    const cards = query ? await searchTmdb(lang, query) : [];
    return <TmdbSearchResults query={query} cards={cards} />;
  } catch (error) {
    if (asAppError(error).code === 'CONFIG') return <TmdbConfigNotice />;
    throw error;
  }
}

export default async function SearchPage({ params, searchParams }: Props) {
  const [{ lang }, { q }] = await Promise.all([params, searchParams]);
  if (!hasLocale(lang)) notFound();
  const query = q?.trim() ?? '';
  return (
    <Shell>
      <DirectionalTransition>
        <div>
          {/* Heading + input stay mounted above the boundary so they never
              flicker against the skeleton (Suspense reveal flicker fix). */}
          <SearchHero>
            <SearchBox initialQuery={query} />
          </SearchHero>
          <Suspense
            key={query}
            fallback={
              <ViewTransition exit="slide-down" default="none">
                <SearchSkeleton />
              </ViewTransition>
            }
          >
            <ViewTransition enter="slide-up" default="none">
              <Results lang={lang} query={query} />
            </ViewTransition>
          </Suspense>
        </div>
      </DirectionalTransition>
    </Shell>
  );
}
