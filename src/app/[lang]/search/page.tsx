import { Suspense } from 'react';
import { Shell } from '@/components/layout/Shell';
import { SearchBox } from '@/components/search/SearchBox';
import { SearchHero } from '@/components/search/SearchHero';
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
      <SearchHero>
        <SearchBox initialQuery={query} />
      </SearchHero>
      <Suspense key={query} fallback={<SearchSkeleton />}>
        <Results query={query} />
      </Suspense>
    </Shell>
  );
}
