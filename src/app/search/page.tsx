import { Suspense, ViewTransition } from 'react';
import { Shell } from '@/components/layout/Shell';
import { SearchBox } from '@/components/search/SearchBox';
import { TmdbSearchResults } from '@/components/tmdb/TmdbSearchResults';
import { DirectionalTransition } from '@/components/transitions/DirectionalTransition';
import { ConfigNotice } from '@/components/ui/ConfigNotice';
import { asAppError } from '@/lib/errors';
import { search } from '@/tmdb/catalog';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ q?: string }> };

async function Results({ query }: { query: string }) {
  try {
    const cards = query ? await search(query) : [];
    return <TmdbSearchResults query={query} cards={cards} />;
  } catch (error) {
    if (asAppError(error).code === 'CONFIG') return <ConfigNotice />;
    throw error;
  }
}

function SearchSkeleton() {
  return (
    <div role="status" aria-label={'Loading search results'} className="content-gutter mt-10">
      <div className="animate-pulse rounded-lg bg-muted text-transparent select-none mb-5 h-8 w-56" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-6">
        {Array.from({ length: 12 }, (_, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder list, never reorders.
            key={i}
            className="animate-pulse rounded-lg bg-muted text-transparent select-none aspect-2/3"
          />
        ))}
      </div>
    </div>
  );
}

export default async function SearchPage({ searchParams }: Props) {
  const { q } = await searchParams;
  const query = q?.trim() ?? '';
  return (
    <Shell>
      <DirectionalTransition>
        <div>
          <section className="content-gutter pt-10 sm:pt-16 lg:pt-20">
            <p className="font-mono text-xs font-medium tracking-[0.22em] text-muted-foreground uppercase">
              {'Search'}
            </p>
            <h1 className="mt-3 max-w-3xl font-heading text-5xl leading-[0.95] tracking-[-0.01em] text-balance sm:text-6xl">
              {'What do you want to watch?'}
            </h1>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              {'Results update as you type. Copy the URL to share.'}
            </p>
            <div className="mt-8">
              <SearchBox initialQuery={query} />
            </div>
          </section>
          <Suspense
            key={query}
            fallback={
              <ViewTransition exit="slide-down" default="none">
                <SearchSkeleton />
              </ViewTransition>
            }
          >
            <ViewTransition enter="slide-up" default="none">
              <Results query={query} />
            </ViewTransition>
          </Suspense>
        </div>
      </DirectionalTransition>
    </Shell>
  );
}
