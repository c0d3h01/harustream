'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { useT } from '@/lib/i18n';

const SKELETON_KEYS = [
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
];

export function SearchSkeleton() {
  const t = useT();
  return (
    <div role="status" aria-label={t('search.loadingResults')} className="mt-10">
      <Skeleton className="mb-5 h-8 w-56 rounded-lg bg-secondary" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-6">
        {SKELETON_KEYS.map((key) => (
          <Skeleton key={key} className="aspect-2/3 rounded-2xl bg-secondary" />
        ))}
      </div>
    </div>
  );
}
