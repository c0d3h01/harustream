'use client';

import { Film, X } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { memo, useMemo } from 'react';
import { localeHref, useLocale, useT } from '@/lib/i18n';
import { imageUrl } from '@/lib/media/images';
import { encodeRef } from '@/lib/refs';

// ---------------------------------------------------------------------------
// Shared shape — covers SearchResult and the subset of Media the card needs.
// ---------------------------------------------------------------------------
export interface MediaCardItem {
  readonly id: string;
  readonly providerId: string;
  readonly providerName: string;
  readonly title: string;
  readonly displayTitle: string;
  readonly posterUrl?: string;
  readonly ref: string;
  readonly kind?: string;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface MediaCardProps {
  /** Media item to render. */
  item: MediaCardItem;
  /** Rank badge overlay (e.g. top-10 list). */
  rank?: number;
  /** Optional navigation href — when omitted the card renders as a plain div. */
  href?: string;
  /** Eager-load the poster (for above-the-fold items). */
  priority?: boolean;
  /** Progress percentage for the continue-watching bar. */
  progress?: number;
  /** Whether the item is already saved to the library. */
  isSaved?: boolean;
  /** Callback to toggle the saved state. */
  onToggleSave?: () => void;
  /** Callback to remove from continue-watching. */
  onRemove?: () => void;
  /** Extra content overlaid on the poster area (e.g. Play button). */
  children?: React.ReactNode;
  /** Additional className applied to the outer container. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
function MediaCardInner({
  item,
  rank,
  href,
  priority = false,
  progress,
  isSaved,
  onToggleSave,
  onRemove,
  children,
  className,
}: MediaCardProps) {
  const t = useT();
  const { locale } = useLocale();

  const hrefComputed = useMemo(
    () =>
      href ??
      localeHref(locale, `/title/${encodeURIComponent(item.providerId)}/${encodeRef(item.ref)}`),
    [href, locale, item.providerId, item.ref],
  );

  const posterSrc = useMemo(() => imageUrl(item.posterUrl), [item.posterUrl]);
  const posterAlt = useMemo(
    () => t('home.posterAlt', { title: item.displayTitle }),
    [item.displayTitle, t],
  );

  const kind = useMemo(
    () =>
      item.kind ??
      (item.title.toLowerCase().includes('season') ? t('kind.series') : t('kind.movie')),
    [item.kind, item.title, t],
  );

  const inner = (
    <>
      {/* ---------- poster area ---------- */}
      <div className="relative aspect-2/3 overflow-hidden bg-secondary">
        {item.posterUrl ? (
          <Image
            src={posterSrc}
            alt={posterAlt}
            fill
            priority={priority}
            sizes="(min-width: 1280px) 170px, (min-width: 1024px) 14vw, (min-width: 640px) 30vw, 42vw"
            className="object-cover transition duration-500 hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-muted-foreground">
            <Film className="size-8 opacity-60" aria-hidden="true" />
          </div>
        )}

        {/* rank badge */}
        {rank ? (
          <span
            role="img"
            className="absolute bottom-1 left-2 z-10 text-6xl font-black leading-none text-foreground/90 drop-shadow-lg"
            aria-label={`${t('home.rank')} ${rank}`}
          >
            {rank}
          </span>
        ) : null}

        {/* play + other overlays */}
        {children}

        {/* remove button (continue-watching) */}
        {onRemove ? (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRemove();
            }}
            className="absolute top-1.5 right-1.5 grid size-9 place-items-center rounded-full border border-border/60 bg-background/85 text-foreground backdrop-blur transition hover:bg-background hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Remove from continue watching"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {/* ---------- metadata footer ---------- */}
      <div className="p-3">
        <p className="line-clamp-2 text-sm font-semibold">{item.displayTitle}</p>
        <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          <span>{item.providerName}</span>
          <span aria-hidden="true">·</span>
          <span>{kind}</span>
        </div>
      </div>

      {/* ---------- progress bar (continue-watching) ---------- */}
      {progress !== undefined ? (
        <div className="px-3 pb-3">
          <div
            className="h-1 rounded-full bg-secondary"
            role="progressbar"
            aria-label={t('home.percentWatched', { percent: Math.round(progress) })}
            aria-valuenow={Math.round(progress)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
          </div>
        </div>
      ) : null}
    </>
  );

  const card = (
    <div
      className={[
        'glass group block min-w-0 overflow-hidden rounded-xl text-left transition duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-[0_12px_40px_-8px_oklch(0.82_0.12_230_/_18%)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      ].join(' ')}
    >
      {inner}
    </div>
  );

  // Every card is navigable — hrefComputed always resolves (explicit prop
  // or the default title-page path).
  return <Link href={hrefComputed}>{card}</Link>;
}

export const MediaCard = memo(MediaCardInner);
