'use client';

import { Play, X } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { RailScroller } from '@/components/ui/rail';
import { localeHref, useLocale, useT } from '@/lib/i18n';
import { imageUrl } from '@/lib/media/images';
import { encodeRef } from '@/lib/refs';
import { useProgress } from '@/lib/storage';

export function ContinueWatching() {
  const t = useT();
  const { locale } = useLocale();
  const movieBoxProgress = useProgress('movieBoxWeb');
  const moviesmodProgress = useProgress('Moviesmod');
  const anikotoProgress = useProgress('anikoto');
  const progress = [movieBoxProgress, moviesmodProgress, anikotoProgress];
  const items = progress
    .flatMap((entry) => entry.list)
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, 12);
  // Two-step confirm so a stray tap can't wipe watch history. The armed
  // state resets itself after a few seconds.
  const [confirming, setConfirming] = useState(false);
  const confirmTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (confirmTimer.current) window.clearTimeout(confirmTimer.current);
    },
    [],
  );
  if (!items.length) return null;
  const handleClearAll = () => {
    if (!confirming) {
      setConfirming(true);
      confirmTimer.current = window.setTimeout(() => setConfirming(false), 3000);
      return;
    }
    if (confirmTimer.current) window.clearTimeout(confirmTimer.current);
    setConfirming(false);
    progress.forEach((entry) => {
      entry.clearAll();
    });
  };
  return (
    <section className="mt-8" aria-labelledby="continue-heading">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="continue-heading" className="text-xl font-semibold tracking-tight">
          {t('home.continueWatching')}
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{t('home.onThisDevice')}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearAll}
            aria-label={confirming ? t('home.clearAllConfirm') : t('home.clearAllAria')}
            className={`h-8 gap-1.5 rounded-full px-2.5 text-xs ${
              confirming ? 'text-destructive hover:bg-destructive/10' : 'text-muted-foreground'
            }`}
          >
            <X className="size-3.5" aria-hidden="true" />
            {confirming ? t('home.clearEverything') : t('home.clearAll')}
          </Button>
        </div>
      </div>
      {/* RailScroller is the single shared horizontal scroller: snap points,
          edge fade mask and content-visibility all come from it. */}
      <RailScroller>
        {items.map((item, index) => {
          const title = item.title ?? t('home.untitled');
          const provider = item.provider ?? 'movieBoxWeb';
          // duration can be 0/undefined mid-scan; guard against NaN/Infinity.
          const percentage =
            item.duration > 0
              ? Math.min(100, Math.max(0, Math.round((item.position / item.duration) * 100)))
              : 0;
          return (
            <div
              key={`${provider}:${item.ref}:${item.episodeRef}`}
              className="w-[150px] shrink-0 snap-start"
            >
              <Link
                href={localeHref(
                  locale,
                  `/watch/${encodeURIComponent(provider)}/${encodeRef(item.ref)}${
                    item.episodeRef ? `?episode=${encodeURIComponent(item.episodeRef)}` : ''
                  }`,
                )}
                className="group block overflow-hidden rounded-2xl border border-border/70 bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="relative aspect-2/3 bg-secondary">
                  {item.poster ? (
                    <Image
                      src={imageUrl(item.poster)}
                      alt={t('home.posterAlt', { title })}
                      fill
                      // First row sits above the fold and is typically the
                      // LCP element; eager-load it instead of the lazy default.
                      loading={index < 4 ? 'eager' : 'lazy'}
                      fetchPriority={index < 4 ? 'high' : 'auto'}
                      sizes="150px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="grid h-full place-items-center text-muted-foreground">
                      {t('home.noPoster')}
                    </div>
                  )}
                  <span className="absolute right-2 bottom-2 grid size-8 place-items-center rounded-full bg-primary text-primary-foreground opacity-0 transition group-hover:opacity-100">
                    <Play className="size-3.5 fill-current" aria-hidden="true" />
                  </span>
                </div>
                <div className="p-2.5">
                  <p className="line-clamp-1 text-xs font-semibold">{title}</p>
                  <div
                    className="mt-2 h-1 rounded-full bg-secondary"
                    role="progressbar"
                    aria-label={t('home.percentWatched', { percent: percentage })}
                    aria-valuenow={percentage}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              </Link>
              <button
                type="button"
                aria-label={t('home.removeContinue', { title })}
                onClick={() =>
                  // Each useProgress hook is already scoped to one provider,
                  // so the entry with this ref in its list IS this provider's.
                  progress
                    .find((entry) => entry.list.some((saved) => saved.ref === item.ref))
                    ?.clear(item.ref, item.episodeRef)
                }
                className="absolute top-1.5 right-1.5 grid size-9 place-items-center rounded-full border border-border/60 bg-background/85 text-foreground backdrop-blur transition hover:bg-background hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </RailScroller>
    </section>
  );
}
