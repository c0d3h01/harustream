'use client';

import { Bookmark, Check, Film, Globe, Play, Star, X } from 'lucide-react';
import { motion } from 'motion/react';
import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DURATIONS, EASE, SPRING_SOFT } from '@/components/motion/transitions';
import { Button } from '@/components/ui/button';
import { type Media, type Meta, titleFor } from '@/lib/api/client';
import { useScrollLock } from '@/lib/hooks/useScrollLock';
import { imageUrl } from '@/lib/media/images';

// Hoisted: created once instead of on every DetailModal render.
const RATING_PATTERN = /\s*\/\s*10$/i;
const YEAR_PATTERN = /\b(19\d{2}|20\d{2})\b/;

type Props = {
  item: Media;
  meta?: Meta;
  inLibrary: boolean;
  onClose: () => void;
  onPlay: (item: Media, hub?: string) => void;
  onToggleLibrary: (item: Media) => void;
  /** Preload the code-split player chunk while the user decides to watch. */
  onPreloadPlay?: () => void;
};

export function DetailModal({
  item,
  meta,
  inLibrary,
  onClose,
  onPlay,
  onToggleLibrary,
  onPreloadPlay,
}: Props) {
  const title = meta?.title || titleFor(item);
  const synopsis = meta?.synopsis || 'No description available.';
  const backdrop = meta?.image || item.image;
  const poster = meta?.poster || meta?.image || item.image;
  const logo = meta?.logo;
  const imdb = meta?.imdbId;
  const rating = meta?.rating?.replace(RATING_PATTERN, '').trim();
  const typeLabel = (meta?.type || item.type || 'Movie').toUpperCase();
  const year =
    (meta?.title || title).match(YEAR_PATTERN)?.[1] ??
    meta?.tags?.find((tag) => /^\d{4}$/.test(String(tag)));
  const metadata = useMemo(
    () => [...(meta?.tags ?? [])].filter(Boolean).map(String).slice(0, 6),
    [meta?.tags],
  );
  const [logoFailed, setLogoFailed] = useState(false);
  const [readMore, setReadMore] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-runs on purpose so a new logo resets the failure flag.
  useEffect(() => {
    setLogoFailed(false);
  }, [logo]);

  // Lock body scroll while the modal is mounted. Restored on unmount. The
  // lock is shared and ref-counted across modals (see useScrollLock), so a
  // nested modal unmount can't leave the body permanently locked.
  useScrollLock();

  const rootRef = useRef<HTMLDivElement | null>(null);

  // Move keyboard focus into the modal on open so tabbing starts inside it,
  // and let Escape close it (mirrors the player and the native dialog
  // behaviour users expect).
  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const synopsisText =
    synopsis.length > 240 && !readMore ? `${synopsis.slice(0, 240)}...` : synopsis;

  const headerMeta = [typeLabel, year, imdb ? `IMDb ${imdb}` : null].filter(Boolean).join(' · ');

  return (
    // AnimatePresence in App drives the enter/exit; transform/opacity only.
    <motion.div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      tabIndex={-1}
      className="fixed inset-0 z-40 flex flex-col bg-background pt-safe outline-hidden sm:grid sm:place-items-center sm:bg-background/80 sm:p-4 sm:backdrop-blur-sm sm:pt-0"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: DURATIONS.fast }}
    >
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 0.98 }}
        transition={SPRING_SOFT}
        className="flex h-full w-full flex-col overflow-hidden overscroll-contain border-border/70 bg-card shadow-2xl sm:h-auto sm:max-h-[92vh] sm:max-w-4xl sm:flex-row sm:overflow-hidden sm:rounded-3xl sm:border"
      >
        {/* Backdrop hero — the title lives on the artwork, not below it, so the
            image and identity read as one cinematic unit. */}
        <div className="relative h-[42vh] min-h-[280px] w-full shrink-0 sm:h-full sm:min-h-[34rem] sm:w-[42%]">
          {backdrop || poster ? (
            <motion.div
              className="absolute inset-0"
              initial={{ scale: 1.08 }}
              animate={{ scale: 1 }}
              transition={{ duration: 1.2, ease: EASE }}
            >
              <Image
                src={imageUrl(backdrop || poster)}
                alt=""
                fill
                sizes="(min-width: 640px) 42vw, 100vw"
                className="object-cover"
                onError={(e) => {
                  e.currentTarget.style.opacity = '0';
                }}
              />
            </motion.div>
          ) : (
            <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-secondary to-secondary/40">
              <Film className="size-12 text-muted-foreground/50" aria-hidden="true" />
            </div>
          )}
          {/* Scrims: a short top one keeps the close button legible against
              any artwork; a stronger bottom one grounds the overlaid title. */}
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-background/70 to-transparent"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-card from-10% via-card/35 via-40% to-transparent"
          />

          <Button
            size="icon"
            variant="ghost"
            onClick={onClose}
            aria-label="Close"
            className="touch-target absolute left-3 top-3 bg-background/70 backdrop-blur sm:left-4 sm:top-4"
          >
            <X className="size-5" />
          </Button>

          {/* Overlaid identity: logo (when provided) or the title, plus rating
              chip and a one-line type/year/IMDb summary. */}
          <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
            {logo && !logoFailed ? (
              <div className="relative h-14 max-w-[240px]">
                <Image
                  src={imageUrl(logo)}
                  alt={title}
                  fill
                  sizes="240px"
                  className="object-contain object-left"
                  onError={() => setLogoFailed(true)}
                />
              </div>
            ) : (
              <h2 className="line-clamp-2 text-2xl font-bold tracking-tight text-foreground drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)] sm:text-3xl">
                {title}
              </h2>
            )}
            {(rating || headerMeta) && (
              <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                {rating && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/70 px-2.5 py-1 text-xs font-semibold text-foreground backdrop-blur-sm">
                    <Star className="size-3.5 fill-primary text-primary" aria-hidden="true" />
                    {rating}
                  </span>
                )}
                {headerMeta && (
                  <p className="text-xs font-medium text-foreground/85">{headerMeta}</p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-5 overflow-y-auto p-5 pb-12 sm:gap-6 sm:p-8">
          {/* Primary actions lead the content — watch is one tap from the
              artwork, with save/web secondary and tertiary. */}
          <div className="flex items-center gap-2">
            <Button
              size="lg"
              className="touch-target flex-1 justify-center transition-transform duration-200 ease-out hover:scale-[1.02] active:scale-[0.97] motion-reduce:transition-none motion-reduce:hover:scale-100 sm:flex-none sm:px-8"
              onClick={() => onPlay(item)}
              onMouseEnter={onPreloadPlay}
              onFocus={onPreloadPlay}
            >
              <Play className="size-4 fill-current" />
              Watch now
            </Button>
            <Button
              size="lg"
              variant="secondary"
              aria-label={inLibrary ? 'Remove from library' : 'Save to library'}
              className="touch-target justify-center transition-transform duration-200 ease-out hover:scale-[1.02] active:scale-[0.97] motion-reduce:transition-none motion-reduce:hover:scale-100"
              onClick={() => onToggleLibrary(item)}
            >
              {inLibrary ? <Check className="size-4" /> : <Bookmark className="size-4" />}
              <span className="hidden sm:inline">{inLibrary ? 'Saved' : 'Save'}</span>
            </Button>
            {meta?.webUrl && (
              <Button
                size="icon"
                variant="ghost"
                aria-label="Open on web"
                className="touch-target shrink-0"
                onClick={() => window.open(meta.webUrl ?? undefined, '_blank', 'noopener')}
              >
                <Globe className="size-4" />
              </Button>
            )}
          </div>

          {metadata.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {metadata.map((tag) => (
                <span
                  key={tag}
                  className="rounded-lg bg-muted px-2.5 py-1 text-xs font-semibold text-primary"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Overview
            </p>
            <p className="text-sm leading-6 text-muted-foreground sm:text-base">{synopsisText}</p>
            {synopsis.length > 240 && (
              <button
                type="button"
                onClick={() => setReadMore((r) => !r)}
                className="touch-target mt-1 w-fit text-sm font-semibold text-primary"
              >
                {readMore ? 'Show less' : 'Read more'}
              </button>
            )}
          </div>

          {meta?.cast && meta.cast.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Cast
              </p>
              <div className="flex flex-wrap gap-1.5">
                {meta.cast.slice(0, 8).map((name) => (
                  <span
                    key={name}
                    className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
