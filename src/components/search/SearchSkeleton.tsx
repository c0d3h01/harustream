'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { useT } from '@/lib/i18n';

export function SearchSkeleton() {
  const t = useT();
  return (
    <div role="status" aria-label={t('search.loadingResults')} className="mt-10">
      <Skeleton className="mb-5 h-8 w-56 rounded-lg bg-secondary" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-6">
        {Array.from({ length: 12 }, (_, i) => (
          <Skeleton key={i} className="aspect-2/3 rounded-2xl bg-secondary" />
        ))}
      </div>
    </div>
  );
}
