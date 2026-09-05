import { Check, Film, Loader2, Play } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Image from 'next/image';
import { memo, useMemo, ViewTransition } from 'react';
import { SPRING } from '@/components/motion/transitions';
import { posterTransitionName } from '@/components/transitions/names';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n';
import { imageUrl } from '@/lib/media/images';
import { useLibrary } from '@/lib/storage';
import type { Media } from '@/types';

interface TitleHeaderProps {
  item: Media;
  canPlay: boolean;
  loadingSources: boolean;
  onPlay: () => void;
}

function TitleHeaderInner({ item, canPlay, loadingSources, onPlay }: TitleHeaderProps) {
  const library = useLibrary(item.providerId);
  const saved = library.has(item.ref);
  const t = useT();

  const posterSrc = useMemo(() => imageUrl(item.posterUrl ?? ''), [item.posterUrl]);
  const posterAlt = useMemo(
    () => t('home.posterAlt', { title: item.displayTitle }),
    [item.displayTitle, t],
  );

  return (
    <section aria-labelledby="title-heading">
      <div className="flex gap-4 sm:gap-6">
        <div className="relative aspect-2/3 w-28 shrink-0 overflow-hidden rounded-xl border border-border/70 bg-secondary sm:w-36 lg:w-44">
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
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            {item.providerId}
          </p>
          <h1
            id="title-heading"
            className="mt-1.5 text-xl font-semibold tracking-tight text-balance sm:text-3xl"
          >
            {item.displayTitle}
          </h1>

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <Badge variant="glass">
              {item.kind === 'series' ? t('kind.series') : t('kind.movie')}
            </Badge>
            {item.rating ? (
              <Badge variant="glass" className="text-primary">
                ★ {item.rating}
              </Badge>
            ) : null}
          </div>
        </div>
      </div>

      {item.synopsis ? (
        <p
          className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground"
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
              <span className="sr-only">{t('title.loadingSources')}</span>
            </>
          ) : (
            <>
              <Play className="size-4 fill-current" aria-hidden="true" />
              {t('title.playNow')}
            </>
          )}
        </Button>
        {/* Save toggle — check pops in/out on tap (interaction), no entrance. */}
        <Button
          variant="glass"
          onClick={() => library.toggle(item)}
          aria-pressed={saved}
          className="h-11 justify-center rounded-lg transition-all duration-200 active:scale-[0.97] sm:justify-start"
        >
          <AnimatePresence mode="wait" initial={false}>
            {saved ? (
              <motion.span
                key="saved"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                transition={SPRING}
                className="flex items-center"
              >
                <Check className="text-primary" aria-hidden="true" />
              </motion.span>
            ) : null}
          </AnimatePresence>
          {saved ? t('title.saved') : t('title.save')}
        </Button>
      </div>
    </section>
  );
}

export const TitleHeader = memo(TitleHeaderInner);
