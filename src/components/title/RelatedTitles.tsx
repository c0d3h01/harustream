'use client';

import { memo, useMemo } from 'react';
import { MediaCard } from '@/components/ui/MediaCard';
import { titleHref } from '@/lib/routes';
import type { SearchResult } from '@/types/media';

function RelatedTitlesInner({ items }: { items: SearchResult[] }) {
  const unique = useMemo(() => {
    const seenIds = new Set<string>();
    const out: SearchResult[] = [];
    for (const related of items) {
      if (out.length >= 8) break;
      if (seenIds.has(related.id)) continue;
      seenIds.add(related.id);
      out.push(related);
    }
    return out;
  }, [items]);

  if (unique.length === 0) return null;

  return (
    <section className="mt-14 border-t border-border pt-10" aria-labelledby="related-title">
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <h2
            id="related-title"
            className="font-heading text-[1.75rem] leading-tight tracking-[-0.01em] text-balance"
          >
            {'You may also like'}
          </h2>
        </div>
      </div>
      <div className="scrollbar-none flex min-w-0 snap-x snap-proximity gap-3 overflow-x-auto px-0.5 py-1 sm:gap-4 contain-paint [content-visibility:auto] [contain-intrinsic-size:auto_250px]">
        {unique.map((related) => (
          <div key={related.id} className="w-[140px] shrink-0 snap-start">
            <MediaCard
              card={{
                key: related.id,
                title: related.displayTitle,
                href: titleHref(related.providerId, related.ref),
                posterUrl: related.posterUrl,
              }}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

export const RelatedTitles = memo(RelatedTitlesInner);
