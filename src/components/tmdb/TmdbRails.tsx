import { useId } from 'react';

import { MediaCard } from '@/components/ui/MediaCard';
import { tmdbPath } from '@/lib/routes';
import type { TmdbCard } from '@/tmdb/catalog';
import { tmdbImageUrl } from '@/tmdb/images';

export interface TmdbSection {
  key: string;
  eyebrow?: string;
  heading: string;
  items: TmdbCard[];
}

export function TmdbRails({ sections }: { sections: TmdbSection[] }) {
  const baseId = useId();
  return (
    <div className="home-rails mt-10 flex min-w-0 flex-col gap-16 sm:mt-14 sm:gap-20">
      {sections.map((section, sectionIndex) => {
        const headingId = `${baseId}-tmdb-${sectionIndex}`;
        if (section.items.length === 0) return null;
        return (
          <section key={section.key} aria-labelledby={headingId} className="min-w-0 scroll-mt-20">
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                {section.eyebrow ? (
                  <p className="mb-2 font-mono text-[11px] font-medium tracking-[0.22em] text-muted-foreground uppercase">
                    {section.eyebrow}
                  </p>
                ) : null}
                <h2
                  id={headingId}
                  className="font-heading text-[1.75rem] leading-tight tracking-[-0.01em] text-balance"
                >
                  {section.heading}
                </h2>
              </div>
              <div className="shrink-0">
                <span className="pb-0.5 text-xs text-muted-foreground">
                  {`${section.items.length} titles`}
                </span>
              </div>
            </div>
            <div className="scrollbar-none flex min-w-0 snap-x snap-proximity gap-3 overflow-x-auto px-0.5 py-1 sm:gap-4 contain-paint [content-visibility:auto] [contain-intrinsic-size:auto_250px]">
              {section.items.map((item, index) => {
                const dedupeKey = `${item.kind}:${item.tmdbId}`;
                return (
                  <div
                    key={dedupeKey}
                    data-rail-card
                    className="w-35 shrink-0 snap-start sm:w-44 lg:w-50.5"
                  >
                    <MediaCard
                      card={{
                        key: dedupeKey,
                        title: item.title,
                        href: tmdbPath(item.kind, item.tmdbId),
                        posterUrl: item.posterPath
                          ? tmdbImageUrl(item.posterPath, 'w342')
                          : undefined,
                        year: item.year,
                        rating: item.rating,
                      }}
                      priority={sectionIndex === 0 && index < 4}
                    />
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
