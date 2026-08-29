'use client';

import { memo } from 'react';
import type { SearchResult } from '@/types';
import { RailScroller } from '@/components/ui/rail';
import { Card } from '@/components/home/Card';

function RelatedTitles({ items }: { items: SearchResult[] }) {
  if (items.length === 0) return null;

  return (
    <section className="mt-14 border-t border-border/60 pt-10" aria-labelledby="related-title">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Keep watching</p>
          <h2 id="related-title" className="mt-1 text-2xl font-semibold tracking-tight text-balance">
            You may also like
          </h2>
        </div>
        <p className="hidden text-sm text-muted-foreground sm:block">More stories selected for you</p>
      </div>
      <RailScroller>
        {items.slice(0, 8).map((related) => (
          <div key={related.id} className="w-[148px] shrink-0 snap-start sm:w-[178px]">
            <Card item={related} />
          </div>
        ))}
      </RailScroller>
    </section>
  );
}

export default memo(RelatedTitles);

export { RelatedTitles };

/* The rail intentionally stays content-first: poster, title, provider and type are
   enough to make the next choice without repeating the title-page controls. */
