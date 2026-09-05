'use client';

import { Info, Star } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '@/lib/i18n';
import { imageUrl } from '@/lib/media/images';
import { tmdbImageUrl } from '@/tmdb/images';

// ---------------------------------------------------------------------------
// Data — lazy mini-details for TMDB cards, cached per title.
// ---------------------------------------------------------------------------
export interface PreviewDetails {
  title: string;
  originalTitle: string;
  year: string | null;
  rating: number;
  genres: string[];
  overview: string;
  runtime: string | null;
  seasons: number | null;
  backdropPath: string | null;
  logoPath: string | null;
}

export interface PreviewRef {
  kind: 'movie' | 'tv';
  tmdbId: number;
}

const detailsCache = new Map<string, PreviewDetails | null>();
const detailsInflight = new Map<string, Promise<PreviewDetails | null>>();

export function fetchPreviewDetails(
  ref: PreviewRef,
  signal: AbortSignal,
): Promise<PreviewDetails | null> {
  const cacheKey = `${ref.kind}:${ref.tmdbId}`;
  const cached = detailsCache.get(cacheKey);
  if (cached !== undefined) return Promise.resolve(cached);
  const inflight = detailsInflight.get(cacheKey);
  if (inflight) return inflight;
  const task = (async () => {
    try {
      const res = await fetch(`/api/tmdb/preview?kind=${ref.kind}&tmdbId=${ref.tmdbId}`, {
        signal,
      });
      if (!res.ok) return null;
      const data = (await res.json()) as PreviewDetails;
      // Cache only real answers — aborts/offline stay uncached.
      detailsCache.set(cacheKey, data);
      return data;
    } catch {
      return null;
    } finally {
      detailsInflight.delete(cacheKey);
    }
  })();
  detailsInflight.set(cacheKey, task);
  return task;
}

// ---------------------------------------------------------------------------
// Panel — fixed-position portal so rail scrollers never clip it. Flips to
// the card's left when the right side has no room, clamps into viewport.
// ---------------------------------------------------------------------------
export interface CardAnchor {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

interface CardTooltipProps {
  anchor: CardAnchor;
  /** Card fallback content (instant — shown while details load). */
  posterUrl?: string;
  title: string;
  year?: string | number | null;
  rating?: number | null;
  detailHref: string;
  /** Fetched mini-details (null while loading, or always for provider cards). */
  details: PreviewDetails | null;
  loadingDetails: boolean;
  /** Play action for TMDB cards (TmdbPlayButton from the caller). */
  playButton?: ReactNode;
  onEnter: () => void;
  onLeave: () => void;
}

const PANEL_WIDTH = 320;
const PANEL_GAP = 12;
const VIEWPORT_MARGIN = 8;

export function CardTooltip({
  anchor,
  posterUrl,
  title,
  year,
  rating,
  detailHref,
  details,
  loadingDetails,
  playButton,
  onEnter,
  onLeave,
}: CardTooltipProps) {
  const t = useT();
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0, ready: false });

  // Seat on mount; re-seat whenever content size changes (shimmer →
  // artwork, image load). ResizeObserver covers all of it, no dep churn.
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const seat = () => {
      const height = el.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let left = anchor.right + PANEL_GAP;
      if (left + PANEL_WIDTH > vw - VIEWPORT_MARGIN) {
        left = anchor.left - PANEL_WIDTH - PANEL_GAP;
      }
      left = Math.max(VIEWPORT_MARGIN, Math.min(left, vw - PANEL_WIDTH - VIEWPORT_MARGIN));
      let top = anchor.top + anchor.height / 2 - height / 2;
      top = Math.max(VIEWPORT_MARGIN, Math.min(top, vh - height - VIEWPORT_MARGIN));
      setPos({ left, top, ready: true });
    };
    seat();
    const ro = new ResizeObserver(seat);
    ro.observe(el);
    return () => ro.disconnect();
  }, [anchor]);

  const backdropSrc = details?.backdropPath
    ? imageUrl(tmdbImageUrl(details.backdropPath, 'w780'))
    : undefined;
  const showYear = details?.year ?? year ?? null;
  const detailRating = details && details.rating > 0 ? details.rating : null;
  const cardRating = (rating ?? 0) > 0 ? rating : null;
  const showRating = detailRating ?? cardRating;
  const metaBits: string[] = [];
  if (details?.runtime) metaBits.push(details.runtime);
  if (details?.seasons) metaBits.push(`${details.seasons} ${t('tmdb.seasons')}`);
  if (details) metaBits.push(...details.genres.slice(0, 3));

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={details?.title ?? title}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
      className={[
        'glass-strong fixed z-[60] w-[320px] overflow-hidden rounded-2xl',
        'transition-opacity duration-150 motion-safe:animate-[tooltip-in_160ms_ease-out]',
        pos.ready ? 'opacity-100' : 'opacity-0',
      ].join(' ')}
      style={{ left: pos.left, top: pos.top }}
    >
      {/* artwork */}
      <div className="relative aspect-video overflow-hidden bg-secondary">
        {backdropSrc ? (
          <Image src={backdropSrc} alt="" fill sizes="320px" className="object-cover" />
        ) : posterUrl ? (
          <Image
            src={imageUrl(posterUrl)}
            alt=""
            fill
            sizes="320px"
            className="object-cover object-top"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
      </div>

      <div className="p-4">
        {loadingDetails && !details ? (
          <div className="space-y-2.5" aria-hidden="true">
            <div className="h-5 w-3/4 animate-pulse rounded-md bg-secondary" />
            <div className="h-3.5 w-1/2 animate-pulse rounded-md bg-secondary" />
            <div className="space-y-1.5 pt-1">
              <div className="h-3.5 animate-pulse rounded-md bg-secondary" />
              <div className="h-3.5 w-5/6 animate-pulse rounded-md bg-secondary" />
            </div>
          </div>
        ) : (
          <>
            <p className="text-base font-bold leading-snug tracking-tight text-balance">
              {details?.title ?? title}
            </p>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] font-medium text-muted-foreground">
              {showYear ? <span className="text-foreground">{showYear}</span> : null}
              {showRating ? (
                <span className="inline-flex items-center gap-1 text-foreground">
                  <Star className="size-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />
                  {showRating.toFixed(1)}
                </span>
              ) : null}
              {metaBits.length > 0 ? <span>{metaBits.join(' · ')}</span> : null}
            </p>
            {details?.overview ? (
              <p className="mt-2 line-clamp-3 text-[13px] leading-relaxed text-muted-foreground">
                {details.overview}
              </p>
            ) : null}
          </>
        )}

        <div className="mt-3.5 flex items-center gap-2">
          {playButton}
          <Link
            href={detailHref}
            prefetch={true}
            className="glass-chip glass-interactive inline-flex h-10 cursor-pointer items-center gap-2 rounded-full px-4 text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Info className="size-4" aria-hidden="true" />
            {t('home.heroCtaMoreInfo')}
          </Link>
        </div>
      </div>
    </div>,
    document.body,
  );
}
