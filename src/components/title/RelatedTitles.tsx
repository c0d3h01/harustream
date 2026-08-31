'use client';

import { memo } from 'react';
import { MediaCard } from '@/components/ui/MediaCard';
import { RailScroller } from '@/components/ui/rail';
import { SectionHeader } from '@/components/ui/SectionHeader';
import type { SearchResult } from '@/types';

function RelatedTitlesInner({ items }: { items: SearchResult[] }) {
  if (items.length === 0) return null;

  return (
    <section className="mt-14 border-t border-border/60 pt-10" aria-labelledby="related-title">
      <SectionHeader
        eyebrow="Keep watching"
        heading="You may also like"
        headingId="related-title"
        trailing={
          <p className="hidden text-sm text-muted-foreground sm:block">
            More stories selected for you
          </p>
        }
        className="mb-5"
      />
      <RailScroller>
        {items.slice(0, 8).map((related) => (
          <div key={related.id} className="w-[148px] shrink-0 snap-start sm:w-[178px]">
            <MediaCard item={related} />
          </div>
        ))}
      </RailScroller>
    </section>
  );
}

export default memo(RelatedTitlesInner);

export { RelatedTitlesInner as RelatedTitles };

/* The rail intentionally stays content-first: poster, title, provider and type are
   enough to make the next choice without repeating the title-page controls. */
