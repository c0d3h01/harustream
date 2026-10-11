'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { RelatedTitles } from '@/components/title/RelatedTitles';
import { TitleHeader } from '@/components/title/TitleHeader';
import { encodeBase64Url } from '@/lib/base64url';
import type { Media, SearchResult } from '@/types/media';

interface TitleExperienceProps {
  item: Media;
  related?: SearchResult[];
}

function TitleExperience({ item, related = [] }: TitleExperienceProps) {
  const router = useRouter();
  const hasPlayableItem = item.groups.some((group) => group.items.length > 0);

  const handlePlay = useCallback(() => {
    router.push(`/watch/${encodeURIComponent(item.providerId)}/${encodeBase64Url(item.ref)}`, {
      transitionTypes: ['nav-forward'],
    });
  }, [router, item.providerId, item.ref]);

  return (
    <div className="content-gutter pt-4 sm:pt-8">
      <div className="rounded-xl border border-border bg-card p-4 sm:p-8 lg:p-10">
        <TitleHeader
          item={item}
          canPlay={hasPlayableItem}
          loadingSources={false}
          onPlay={handlePlay}
        />
        <div className="mt-8 flex flex-wrap items-center gap-2 border-t border-border pt-6">
          {item.tags.slice(0, 6).map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-secondary-foreground"
            >
              {tag}
            </span>
          ))}
          {item.imdbId ? (
            <span className="font-mono text-xs text-muted-foreground tabular-nums">
              IMDb {item.imdbId}
            </span>
          ) : null}
        </div>
      </div>
      <RelatedTitles items={related} />
    </div>
  );
}

export { TitleExperience };
