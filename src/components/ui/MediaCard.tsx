'use client';

import { Film, Play, Star, X } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { memo, useCallback, useEffect, useMemo, useRef, useState, ViewTransition } from 'react';
import { posterTransitionName } from '@/components/transitions/names';
import { localeHref, useLocale, useT } from '@/lib/i18n';
import { imageUrl } from '@/lib/media/images';
import { encodeRef } from '@/lib/refs';
import {
  type CardAnchor,
  CardTooltip,
  fetchPreviewDetails,
  type PreviewDetails,
} from './MediaCardTooltip';

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
  /** Release year shown in the overlay (TMDB cards). Omit to hide. */
  readonly year?: string | number | null;
  /** 0–10 score shown as ★ in the overlay (TMDB cards). Omit or ≤0 to hide. */
  readonly rating?: number | null;
  /** TMDB identity for the hover tooltip's lazy mini-details fetch. */
  readonly trailerRef?: { kind: 'movie' | 'tv'; tmdbId: number };
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
  /** Play action rendered in the hover tooltip (TMDB cards). */
  playButton?: React.ReactNode;
  /** Additional className applied to the outer container. */
  className?: string;
  /**
   * Opt in to the shared poster morph (pairs with TitleHeader on detail).
   * Off by default: only one mounted `<ViewTransition>` may hold a given
   * `name`, so lists that can show the same item twice on one page
   * (overlapping rails, continue-watching mirroring the catalog) must leave
   * this off — otherwise the morph errors. Canonical lists enable it for the
   * first occurrence of each item (see FeaturedRails dedupe).
   */
  sharePoster?: boolean;
}

// ---------------------------------------------------------------------------
// Hover tooltip — mini-details portal on hover-intent. Desktop fine-pointer
// only; touch/keyboard get the static poster + overlay and navigate on tap.
// ---------------------------------------------------------------------------

// Hover-intent delay before the tooltip opens (avoids flashes while skimming).
const TOOLTIP_INTENT_MS = 400;
// Grace period to glide from the card into the tooltip without it closing.
const TOOLTIP_CLOSE_MS = 150;

// ---------------------------------------------------------------------------
// Component — interaction motion only (hover lift + tap shrink via CSS).
// Render entrance: none (instant). Route motion: shared poster morph +
// directional page slide, both driven by `<ViewTransition>`.
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
  playButton,
  className,
  sharePoster = false,
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

  const showMeta = item.year != null || (item.rating ?? 0) > 0;

  // Tooltip eligibility is fixed per card: desktop fine-pointer hover only.
  // Touch/keyboard get the static poster + info overlay (tap navigates).
  const tooltipEligible = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  }, []);

  const [tipAnchor, setTipAnchor] = useState<CardAnchor | null>(null);
  const [tipDetails, setTipDetails] = useState<PreviewDetails | null>(null);
  const [tipLoading, setTipLoading] = useState(false);
  const intentTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);
  const tipFetch = useRef<AbortController | null>(null);

  const closeTooltip = useCallback(() => {
    if (intentTimer.current !== null) {
      window.clearTimeout(intentTimer.current);
      intentTimer.current = null;
    }
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    tipFetch.current?.abort();
    tipFetch.current = null;
    setTipAnchor(null);
    setTipDetails(null);
    setTipLoading(false);
  }, []);

  // Drop the tooltip on unmount / scroll / resize / Escape (stale position).
  useEffect(() => {
    window.addEventListener('scroll', closeTooltip, { capture: true, passive: true });
    window.addEventListener('resize', closeTooltip);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeTooltip();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', closeTooltip, { capture: true });
      window.removeEventListener('resize', closeTooltip);
      window.removeEventListener('keydown', onKey);
      closeTooltip();
    };
  }, [closeTooltip]);

  const startTooltip = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
      if (!tooltipEligible) return;
      if (closeTimer.current !== null) {
        window.clearTimeout(closeTimer.current);
        closeTimer.current = null;
      }
      if (tipAnchor !== null || intentTimer.current !== null) return;
      const target = event.currentTarget;
      intentTimer.current = window.setTimeout(() => {
        intentTimer.current = null;
        const rect = target.getBoundingClientRect();
        setTipAnchor({
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        });
        if (item.trailerRef) {
          setTipLoading(true);
          const controller = new AbortController();
          tipFetch.current = controller;
          void fetchPreviewDetails(item.trailerRef, controller.signal).then((details) => {
            if (controller.signal.aborted) return;
            tipFetch.current = null;
            setTipDetails(details);
            setTipLoading(false);
          });
        }
      }, TOOLTIP_INTENT_MS);
    },
    [tooltipEligible, tipAnchor, item.trailerRef],
  );

  const scheduleClose = useCallback(() => {
    if (closeTimer.current !== null) return;
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null;
      closeTooltip();
    }, TOOLTIP_CLOSE_MS);
  }, [closeTooltip]);

  const cancelClose = useCallback(() => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  // Shared-element name — pairs with TitleHeader on the detail page.
  // `default="none"` keeps it silent on unrelated transitions; `share="morph"`
  // glides the poster when navigating deeper (untyped back morphs too).
  // Only rendered when `sharePoster` is on (see prop docs for why).
  const posterName = posterTransitionName(item.providerId, item.ref);
  const posterImage = (
<Image
          src={posterSrc}
          alt={posterAlt}
          fill
          priority={priority}
          sizes="180px"
          className="object-cover transition duration-500 hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        />
  );

  const inner = (
    <>
      {/* ---------- poster-bleed card: artwork fills the whole surface,
          info lives in the centered overlay (hover/focus on desktop,
          always visible on touch). ---------- */}
<div
          className="relative aspect-3/4 overflow-hidden bg-secondary"
        onPointerEnter={startTooltip}
        onPointerLeave={scheduleClose}
      >
        {item.posterUrl ? (
          sharePoster ? (
            <ViewTransition name={posterName} share="morph" default="none">
              {posterImage}
            </ViewTransition>
          ) : (
            posterImage
          )
        ) : (
          <div className="absolute inset-0 grid place-items-center text-muted-foreground">
            <Film className="size-8 opacity-60" aria-hidden="true" />
          </div>
        )}

        {/* info overlay — reference-level transparency */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-gradient-to-t from-black/70 via-black/25 to-transparent p-3 text-center opacity-0 transition-opacity duration-300 group-focus-visible:opacity-100 group-active:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
          <span
            className="grid size-12 scale-90 place-items-center rounded-full bg-white text-black shadow-xl transition-transform duration-300 group-hover:scale-100"
            aria-hidden="true"
          >
            <Play className="size-5 fill-current" />
          </span>
          <p className="line-clamp-2 text-sm font-semibold text-balance text-white">
            {item.displayTitle}
          </p>
          {showMeta ? (
            <p className="flex items-center gap-1.5 text-xs font-medium text-white/85">
              {item.year != null ? <span>{item.year}</span> : null}
              {(item.rating ?? 0) > 0 ? (
                <span className="inline-flex items-center gap-1">
                  <Star className="size-3 fill-amber-400 text-amber-400" aria-hidden="true" />
                  {item.rating?.toFixed(1)}
                </span>
              ) : null}
            </p>
          ) : null}
        </div>

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

        {/* remove button (continue-watching) — tap shrinks. */}
        {onRemove ? (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRemove();
            }}
            className="glass-chip absolute top-1.5 right-1.5 z-10 grid size-9 cursor-pointer place-items-center rounded-full text-foreground transition-all duration-150 before:absolute before:-inset-[5px] before:content-[''] hover:text-destructive active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Remove from continue watching"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        ) : null}

        {/* ---------- progress bar (continue-watching), pinned to the card edge ---------- */}
        {progress !== undefined ? (
          <div
            className="absolute inset-x-0 bottom-0 z-10 h-1 bg-white/20"
            role="progressbar"
            aria-label={t('home.percentWatched', { percent: Math.round(progress) })}
            aria-valuenow={Math.round(progress)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="h-full rounded-r-full bg-white" style={{ width: `${progress}%` }} />
          </div>
        ) : null}
      </div>
    </>
  );

  const card = (
    <div
      className={[
        'glass-card group block min-w-0 cursor-pointer overflow-hidden rounded-xl text-left transition duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-[0_12px_40px_-8px_oklch(0.82_0.12_230_/_18%)] active:scale-[0.98] active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      ].join(' ')}
    >
      {inner}
    </div>
  );

  // Every card navigates deeper (list → detail/watch) — tag hierarchical so
  // `DirectionalTransition` slides forward. Lateral dock tabs carry no type.
  // The hover tooltip portals to document.body (never clipped by rails).
  return (
    <>
      <Link href={hrefComputed} transitionTypes={['nav-forward']} prefetch={true}>
        {card}
      </Link>
      {tipAnchor ? (
        <CardTooltip
          anchor={tipAnchor}
          posterUrl={item.posterUrl}
          title={item.displayTitle}
          year={item.year}
          rating={item.rating}
          detailHref={hrefComputed}
          details={tipDetails}
          loadingDetails={tipLoading}
          playButton={playButton}
          onEnter={cancelClose}
          onLeave={closeTooltip}
        />
      ) : null}
    </>
  );
}

export const MediaCard = memo(MediaCardInner);
