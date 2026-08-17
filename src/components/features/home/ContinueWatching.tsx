'use client';

import { ChevronLeft, ChevronRight, Film, Play } from 'lucide-react';
import { memo, useRef } from 'react';
import { RailArrow, RailScroller } from '@/components/ui/rail';
import type { Media } from '@/lib/api/client';
import { useProgress } from '@/lib/hooks/useProgress';

type Props = {
  provider: string;
  onResume: (item: Media) => void;
};

export const ContinueWatching = memo(function ContinueWatching({ provider, onResume }: Props) {
  const progress = useProgress(provider);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const items = progress.list();

  const scrollByPage = (dir: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  if (items.length === 0) return null;

  return (
    <section className="mt-8 min-w-0 sm:mt-10">
      <div className="mb-3 flex items-center justify-between sm:mb-4">
        <h2 className="text-base font-semibold tracking-tight sm:text-lg">Continue watching</h2>
        <div className="hidden items-center gap-1 sm:flex">
          <RailArrow
            onClick={() => scrollByPage(-1)}
            ariaLabel="Scroll continue watching backwards"
          >
            <ChevronLeft className="size-4" />
          </RailArrow>
          <RailArrow onClick={() => scrollByPage(1)} ariaLabel="Scroll continue watching forwards">
            <ChevronRight className="size-4" />
          </RailArrow>
        </div>
      </div>
      <RailScroller ref={scrollerRef}>
        {items.map((entry) => {
          const item: Media = {
            link: entry.link,
            title: entry.title || 'Untitled',
            image: entry.poster,
            type: entry.type,
          };
          const pct = Math.min(100, Math.max(0, (entry.position / entry.duration) * 100));
          return (
            <div key={entry.link} className="w-[clamp(110px,30vw,150px)] shrink-0">
              <button
                type="button"
                onClick={() => onResume(item)}
                className="group block w-full overflow-hidden rounded-xl bg-secondary text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <div className="relative overflow-hidden aspect-[2/3]">
                  {/* Poster fallback: shown when there's no poster or the image
                      failed to load, so cards are never blank. */}
                  <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-secondary to-secondary/60 text-muted-foreground">
                    <Film className="size-8 opacity-60" />
                  </div>
                  {entry.poster ? (
                    // biome-ignore lint/performance/noImgElement: images are served unoptimized (next.config `images.unoptimized`), so next/image adds no value here.
                    <img
                      src={entry.poster}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="absolute inset-0 size-full object-cover transition duration-500 group-hover:scale-105"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  ) : null}
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                  <span className="pointer-events-none absolute right-2 bottom-2 grid size-8 place-items-center rounded-full bg-primary text-primary-foreground opacity-0 transition-opacity group-hover:opacity-100">
                    <Play className="size-3.5 fill-current" />
                  </span>
                </div>
                <p className="mt-2 line-clamp-1 px-0.5 text-xs font-semibold">{entry.title}</p>
                {entry.episodeTitle && (
                  <p className="mt-0.5 line-clamp-1 px-0.5 text-[11px] text-muted-foreground">
                    {entry.episodeTitle}
                  </p>
                )}
              </button>
              <div
                className="mt-2 h-[3px] overflow-hidden rounded-sm bg-secondary"
                role="progressbar"
                aria-valuenow={Math.round(pct)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div className="h-full rounded-sm bg-primary" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </RailScroller>
    </section>
  );
});
