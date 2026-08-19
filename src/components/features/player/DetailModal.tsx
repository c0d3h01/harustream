'use client';

import { Bookmark, Check, Globe, Play, X } from 'lucide-react';
import { motion } from 'motion/react';
import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { DURATIONS, EASE, SPRING_SOFT } from '@/components/motion/transitions';
import { Button } from '@/components/ui/button';
import { type Media, type Meta, sortLinkListByQuality, titleFor } from '@/lib/api/client';
import { useScrollLock } from '@/lib/hooks/useScrollLock';
import { imageUrl } from '@/lib/media/images';
import { cn } from '@/lib/utils';

// Hoisted: created once instead of on every DetailModal render.
const RATING_PATTERN = /\s*\/\s*10$/i;

type Props = {
  item: Media;
  meta?: Meta;
  inLibrary: boolean;
  excludedQualities?: string[];
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
  excludedQualities = [],
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
  // Memoized: the auto-select effect watches `entries`, so a fresh array per
  // render would re-run it (and the modal's other effects) on every paint.
  const entries = useMemo(
    () =>
      sortLinkListByQuality(meta?.linkList).filter((entry) => {
        if (excludedQualities.length === 0) return true;
        const q = (entry.quality || entry.title || '').toLowerCase();
        return !excludedQualities.some((excluded) => q.includes(excluded.toLowerCase()));
      }),
    [meta?.linkList, excludedQualities],
  );
  const metadata = useMemo(
    () => [...(meta?.tags ?? [])].filter(Boolean).map(String).slice(0, 6),
    [meta?.tags],
  );
  const [logoFailed, setLogoFailed] = useState(false);
  const [readMore, setReadMore] = useState(false);
  const [activeHub, setActiveHub] = useState<string | undefined>(undefined);

  // Once meta arrives, default the selection to the best available quality.
  // The modal mounts before meta resolves (onOpen fetches it async), so the
  // picker can't pick a default from state initializers.
  useEffect(() => {
    if (activeHub) return;
    const entry = entries[0];
    const hub = entry?.directLinks?.[0]?.link ?? entry?.episodesLink;
    if (hub) setActiveHub(hub);
  }, [entries, activeHub]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-runs on purpose so a new logo resets the failure flag.
  useEffect(() => {
    setLogoFailed(false);
  }, [logo]);

  // Lock body scroll while the modal is mounted. Restored on unmount. The
  // lock is shared and ref-counted across modals (see useScrollLock), so a
  // nested modal unmount can't leave the body permanently locked.
  useScrollLock();

  const synopsisText =
    synopsis.length > 240 && !readMore ? `${synopsis.slice(0, 240)}...` : synopsis;

  return (
    // AnimatePresence in App drives the enter/exit; transform/opacity only.
    <motion.div
      className="fixed inset-0 z-40 flex flex-col bg-background pt-safe sm:grid sm:place-items-center sm:bg-background/80 sm:p-4 sm:backdrop-blur-sm sm:pt-0"
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
        {/* Backdrop */}
        <div className="relative h-64 w-full shrink-0 sm:h-full sm:min-h-[34rem] sm:w-[40%]">
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
                sizes="(min-width: 640px) 40vw, 100vw"
                className="object-cover"
                onError={(e) => {
                  e.currentTarget.style.opacity = '0';
                }}
              />
            </motion.div>
          ) : null}
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(to bottom, rgba(0,0,0,0.12) 0%, rgba(0,0,0,0.10) 58%, var(--card) 100%)',
            }}
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
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-5 overflow-y-auto p-5 sm:gap-6 sm:p-8">
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              {logo && !logoFailed ? (
                <div className="relative mb-1 h-16 max-w-[220px]">
                  <Image
                    src={imageUrl(logo)}
                    alt={title}
                    fill
                    sizes="220px"
                    className="object-contain object-left"
                    onError={() => setLogoFailed(true)}
                  />
                </div>
              ) : (
                <h2 className="line-clamp-2 text-xl font-semibold sm:text-2xl">{title}</h2>
              )}
              {!logo && (
                <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
                  {(meta?.type || item.type || 'Movie').toUpperCase()}
                  {imdb ? ` · IMDb ${imdb}` : ''}
                </p>
              )}
            </div>
            {rating && (
              <div className="flex shrink-0 items-baseline gap-1 pb-1">
                <span className="text-2xl font-semibold sm:text-3xl">{rating}</span>
                <span className="text-sm text-muted-foreground">/10</span>
              </div>
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

          <p className="text-sm leading-6 text-muted-foreground sm:text-base">{synopsisText}</p>
          {synopsis.length > 240 && (
            <button
              type="button"
              onClick={() => setReadMore((r) => !r)}
              className="touch-target -mt-2 w-fit text-sm font-semibold text-primary"
            >
              {readMore ? 'Show less' : 'Read more'}
            </button>
          )}

          {entries.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {entries.some((e) => e.directLinks?.length) ? 'Quality' : 'Season'}
              </p>
              <div className="flex flex-wrap gap-2">
                {entries.map((entry) => {
                  const hub = entry.directLinks?.[0]?.link ?? entry.episodesLink;
                  const label = entry.title || entry.quality || 'Source';
                  const selected = hub === activeHub;
                  return (
                    <button
                      key={hub || label}
                      type="button"
                      onClick={() => hub && setActiveHub(hub)}
                      aria-pressed={selected}
                      className={cn(
                        'touch-target relative rounded-full px-4 py-2 text-sm font-medium transition-colors',
                        selected
                          ? 'text-background'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {selected && (
                        <motion.span
                          layoutId="detail-quality-pill"
                          className="absolute inset-0 rounded-full bg-foreground"
                          transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                        />
                      )}
                      <span className="relative z-10">{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

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

          <div className="mt-auto flex flex-col gap-2 pt-2 sm:flex-row sm:flex-wrap sm:gap-3 sm:pt-0">
            <Button
              size="lg"
              className="touch-target w-full justify-center transition-transform duration-200 ease-out hover:scale-[1.03] active:scale-[0.97] motion-reduce:transition-none motion-reduce:hover:scale-100 sm:w-auto"
              onClick={() => onPlay(item, activeHub)}
              onMouseEnter={onPreloadPlay}
              onFocus={onPreloadPlay}
            >
              <Play className="size-4 fill-current" />
              Watch now
            </Button>
            <Button
              size="lg"
              variant="secondary"
              className="touch-target w-full justify-center transition-transform duration-200 ease-out hover:scale-[1.03] active:scale-[0.97] motion-reduce:transition-none motion-reduce:hover:scale-100 sm:w-auto"
              onClick={() => onToggleLibrary(item)}
            >
              {inLibrary ? <Check className="size-4" /> : <Bookmark className="size-4" />}
              {inLibrary ? 'Saved' : 'Save'}
            </Button>
            {meta?.webUrl && (
              <Button
                size="lg"
                variant="ghost"
                className="touch-target w-full justify-center sm:w-auto"
                onClick={() => window.open(meta.webUrl ?? undefined, '_blank', 'noopener')}
              >
                <Globe className="size-4" />
                Web
              </Button>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
