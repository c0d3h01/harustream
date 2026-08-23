import { Suspense } from 'react';
import { Shell } from '@/components/layout/Shell';
import { SearchBox } from '@/components/search/SearchBox';
import { SearchResults } from '@/components/search/SearchResults';
import { SearchSkeleton } from '@/components/search/SearchSkeleton';
import { search } from '@/services/search';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ q?: string }> };

async function Results({ query }: { query: string }) {
  const results = query ? await search(query) : [];
  return <SearchResults query={query} results={results} />;
}

export default async function SearchPage({ searchParams }: Props) {
  const query = (await searchParams).q?.trim() ?? '';
  return (
    <Shell>
      <section className="mx-auto max-w-3xl pt-16 sm:pt-24">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">Search</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
          What do you want to watch?
        </h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          Search is shareable, so every result page can be bookmarked or sent to a friend.
        </p>
        <div className="mt-8">
          <SearchBox initialQuery={query} />
        </div>
      </section>
      <Suspense key={query} fallback={<SearchSkeleton />}>
        <Results query={query} />
      </Suspense>
    </Shell>
  );
}
