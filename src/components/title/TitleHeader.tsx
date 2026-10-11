import { Check, Film, Loader2, Play, Star } from 'lucide-react';
import Image from 'next/image';
import { memo, useMemo, ViewTransition } from 'react';
import { posterTransitionName } from '@/components/transitions/names';
import { Button } from '@/components/ui/button';
import { imgUrl } from '@/lib/media';
import { useLibrary } from '@/lib/storage';
import type { Media } from '@/types/media';

interface TitleHeaderProps {
  item: Media;
  canPlay: boolean;
  loadingSources: boolean;
  onPlay: () => void;
}

function TitleHeaderInner({ item, canPlay, loadingSources, onPlay }: TitleHeaderProps) {
  const library = useLibrary(item.providerId);
  const saved = library.has(item.ref);

  const posterSrc = useMemo(() => imgUrl(item.posterUrl ?? ''), [item.posterUrl]);
  const posterAlt = useMemo(() => `${item.displayTitle} poster`, [item.displayTitle]);

  return (
    <section aria-labelledby="title-heading">
      <div className="flex gap-4 sm:gap-6">
        <div className="relative aspect-2/3 w-28 shrink-0 overflow-hidden rounded-lg border border-border bg-muted sm:w-36 lg:w-44">
          {item.posterUrl ? (
            <ViewTransition
              name={posterTransitionName(item.providerId, item.ref)}
              share="morph"
              default="none"
            >
              <Image
                src={posterSrc}
                alt={posterAlt}
                fill
                priority
                sizes="(min-width: 1024px) 11rem, (min-width: 640px) 9rem, 7rem"
                className="object-cover"
              />
            </ViewTransition>
          ) : (
            <div
              className="absolute inset-0 grid place-items-center text-muted-foreground"
              aria-hidden="true"
            >
              <Film className="size-8 opacity-40" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-mono text-xs font-medium tracking-[0.22em] text-muted-foreground uppercase">
            {item.providerId}
          </p>
          <h1
            id="title-heading"
            className="mt-1.5 font-heading text-3xl tracking-[-0.01em] text-balance sm:text-4xl"
          >
            {item.displayTitle}
          </h1>

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[10px] font-medium tracking-[0.18em] uppercase transition-colors border border-border bg-muted text-secondary-foreground">
              {item.kind === 'series' ? 'Series' : 'Movie'}
            </span>
            {item.rating ? (
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[10px] font-medium tracking-[0.18em] uppercase transition-colors border border-border bg-muted text-secondary-foreground">
                <Star className="size-3 fill-primary text-primary" aria-hidden="true" />
                {item.rating}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {item.synopsis ? (
        <p
          className="mt-4 max-w-[65ch] text-sm leading-relaxed text-muted-foreground text-pretty"
          id="title-synopsis"
        >
          {item.synopsis}
        </p>
      ) : null}

      <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <Button
          onClick={onPlay}
          disabled={!canPlay || loadingSources}
          className="h-12 w-full gap-2.5 rounded-xl px-6 font-semibold transition-transform duration-150 active:scale-[0.98] sm:w-auto"
          aria-busy={loadingSources}
        >
          {loadingSources ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              <span className="sr-only">{'Loading sources…'}</span>
            </>
          ) : (
            <>
              <Play className="size-4 fill-current" aria-hidden="true" />
              {'Play now'}
            </>
          )}
        </Button>
        <Button
          variant="outline"
          onClick={() => library.toggle(item)}
          aria-pressed={saved}
          className="h-11 justify-center rounded-lg transition-all duration-200 active:scale-[0.97] sm:justify-start"
        >
          {saved ? (
            <span key="saved" className="flex items-center">
              <Check className="text-primary" aria-hidden="true" />
            </span>
          ) : null}
          {saved ? 'Saved' : 'Save'}
        </Button>
      </div>
    </section>
  );
}

export const TitleHeader = memo(TitleHeaderInner);
