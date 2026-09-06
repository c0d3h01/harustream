'use client';

import { useId, ViewTransition } from 'react';

import { RailScroller } from '@/components/ui/rail';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { useT } from '@/lib/i18n';
import type { TmdbCard } from '@/tmdb/catalog';
import { TmdbMediaCard } from './TmdbMediaCard';

export interface TmdbSection {
  key: string;
  eyebrow?: string;
  heading: string;
  items: TmdbCard[];
}

/** TMDB rails — same list-identity pattern as the catalog rails: bare outer
 *  VT per card glides on updates, inner poster morph is first-occurrence-wins
 *  across every section (trending + popular can overlap). */
export function TmdbRails({ sections }: { sections: TmdbSection[] }) {
  const baseId = useId();
  const t = useT();
  const seen = new Set<string>();
  return (
    <div className="home-rails mt-10 flex flex-col gap-16 sm:mt-14 sm:gap-20">
      {sections.map((section, sectionIndex) => {
        const headingId = `${baseId}-tmdb-${sectionIndex}`;
        if (section.items.length === 0) return null;
        return (
          <section key={section.key} aria-labelledby={headingId}>
            <SectionHeader
              eyebrow={section.eyebrow}
              heading={section.heading}
              headingId={headingId}
              trailing={
                <span className="pb-0.5 text-xs text-muted-foreground">
                  {t('home.titlesCount', { count: section.items.length })}
                </span>
              }
            />
            <RailScroller>
              {section.items.map((item, index) => {
                const dedupeKey = `${item.kind}:${item.tmdbId}`;
                const firstSeen = !seen.has(dedupeKey);
                seen.add(dedupeKey);
                return (
                  <ViewTransition key={dedupeKey}>
                    <div data-rail-card className="w-34.5 shrink-0 snap-start sm:w-44 lg:w-50.5">
                      <TmdbMediaCard
                        card={item}
                        priority={sectionIndex === 0 && index < 4}
                        sharePoster={firstSeen}
                      />
                    </div>
                  </ViewTransition>
                );
              })}
            </RailScroller>
          </section>
        );
      })}
    </div>
  );
}
