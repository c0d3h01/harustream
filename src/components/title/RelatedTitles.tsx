'use client';

import { memo, useMemo, ViewTransition } from 'react';
import { MediaCard } from '@/components/ui/MediaCard';
import { RailScroller } from '@/components/ui/rail';
import { SectionHeader } from '@/components/ui/SectionHeader';
import type { SearchResult } from '@/types';

function RelatedTitlesInner({ items }: { items: SearchResult[] }) {
  // Dedupe defensively: related is flattened across rails, so the same title
  // can repeat. Only the first occurrence gets the shared morph — duplicate
  // mounted `name`s error the transition.
  const unique = useMemo(() => {
    const seen = new Set<string>();
    return items
      .slice(0, 8)
      .map((related) => {
        const key = `${related.providerId}:${related.ref}`;
        const firstSeen = !seen.has(key);
        seen.add(key);
        return { related, firstSeen };
      })
      .filter(
        ({ related }, index, arr) => arr.findIndex((e) => e.related.id === related.id) === index,
      );
  }, [items]);

  if (unique.length === 0) return null;

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
        {unique.map(({ related, firstSeen }) => (
          <ViewTransition key={related.id}>
            <div className="w-[140px] shrink-0 snap-start">
              <MediaCard item={related} sharePoster={firstSeen} />
            </div>
          </ViewTransition>
        ))}
      </RailScroller>
    </section>
  );
}

export default memo(RelatedTitlesInner);

export { RelatedTitlesInner as RelatedTitles };

/* The rail intentionally stays content-first: the poster-bleed card with its
   overlay (play + title) is enough to make the next choice without repeating
   the title-page controls. */
