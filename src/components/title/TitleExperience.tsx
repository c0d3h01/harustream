'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { RelatedTitles } from '@/components/title/RelatedTitles';
import { TitleHeader } from '@/components/title/TitleHeader';
import { localeHref, useLocale } from '@/lib/i18n';
import { encodeRef } from '@/lib/refs';
import type { Media, SearchResult } from '@/types';

interface TitleExperienceProps {
  item: Media;
  related?: SearchResult[];
}

function TitleExperience({ item, related = [] }: TitleExperienceProps) {
  const router = useRouter();
  const { locale } = useLocale();
  const hasPlayableItem = item.groups.some((group) => group.items.length > 0);

  const handlePlay = useCallback(() => {
    // Hierarchical deeper (title → watch): slide forward.
    router.push(
      localeHref(locale, `/watch/${encodeURIComponent(item.providerId)}/${encodeRef(item.ref)}`),
      { transitionTypes: ['nav-forward'] },
    );
  }, [router, locale, item.providerId, item.ref]);

  return (
    <div className="mx-auto max-w-7xl pt-4 sm:pt-8">
      <div className="glass-card rounded-[1.5rem] p-4 sm:rounded-[2rem] sm:p-8 lg:p-10">
        <TitleHeader
          item={item}
          canPlay={hasPlayableItem}
          loadingSources={false}
          onPlay={handlePlay}
        />
        <div className="mt-8 flex flex-wrap items-center gap-2 border-t border-border/60 pt-6">
          {item.tags.slice(0, 6).map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground"
            >
              {tag}
            </span>
          ))}
          {item.imdbId ? (
            <span className="text-xs text-muted-foreground">IMDb {item.imdbId}</span>
          ) : null}
        </div>
      </div>
      <RelatedTitles items={related} />
    </div>
  );
}

export { TitleExperience };
