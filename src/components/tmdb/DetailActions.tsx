'use client';

import { ArrowLeft, Check, Play, Plus, Volume2, VolumeX, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useLibrary } from '@/lib/storage';
import { cn } from '@/lib/utils';
import type { TmdbKind, TmdbTrailer } from '@/tmdb/catalog';
import { tmdbSaveItem } from './saveItem';
import { TrailerEmbed } from './TrailerEmbed';

function scrollToSources(): void {
  const target = document.getElementById('tmdb-sources');
  if (!target) return;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({ behavior: reduceMotion ? 'instant' : 'smooth', block: 'start' });
}

export function BackButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.back()}
      aria-label={'Back'}
      className="mb-4 inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-all duration-200 hover:border-input hover:text-foreground active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      {'Back'}
    </button>
  );
}

export function PlayScrollButton() {
  return (
    <Button
      type="button"
      onClick={scrollToSources}
      className="h-12 gap-2.5 rounded-lg px-6 text-[0.95rem] font-semibold max-sm:flex-1"
    >
      <Play className="size-4 fill-current" aria-hidden="true" />
      {'Play'}
    </Button>
  );
}

export function DetailSaveButton({
  kind,
  tmdbId,
  title,
  posterPath,
}: {
  kind: TmdbKind;
  tmdbId: number;
  title: string;
  posterPath?: string;
}) {
  const library = useLibrary('tmdb');
  const ref = `${kind}:${tmdbId}`;
  const saved = library.has(ref);
  const saveItem = tmdbSaveItem(kind, tmdbId, title, posterPath);
  return (
    <button
      type="button"
      onClick={() => library.toggle(saveItem)}
      aria-pressed={saved}
      className="inline-flex h-12 cursor-pointer items-center justify-center gap-2 rounded-lg border border-border px-5 text-sm font-semibold text-foreground transition-all duration-200 hover:border-input hover:bg-muted active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-sm:flex-1"
    >
      {saved ? (
        <Check className="size-4" aria-hidden="true" />
      ) : (
        <Plus className="size-4" aria-hidden="true" />
      )}
      {saved ? 'Saved' : 'Save'}
    </button>
  );
}

export function ExpandableOverview({ overview }: { overview: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="mt-6 max-w-[65ch]">
      <p
        className={cn(
          'text-[15px] leading-relaxed text-foreground/80 text-pretty',
          !expanded && 'line-clamp-3',
        )}
      >
        {overview}
      </p>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="mt-1.5 cursor-pointer text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {expanded ? 'Read less' : 'Read more'}
      </button>
    </div>
  );
}

export function TrailerButton({ trailer }: { trailer: TmdbTrailer }) {
  const [open, setOpen] = useState(false);
  const [muted, setMuted] = useState(true);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="h-12 gap-2.5 rounded-lg px-6 text-[0.95rem] font-semibold"
      >
        <Play className="size-4 fill-current" aria-hidden="true" />
        {'Watch trailer'}
      </Button>
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Trailer: ${trailer.name}`}
          className="fixed inset-0 z-chrome bg-black"
        >
          <TrailerEmbed trailerKey={trailer.key} muted={muted} name={trailer.name} />
          <p className="absolute right-4 bottom-4 left-4 truncate text-center text-sm font-medium text-white/80">
            {trailer.name}
          </p>
          <div className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 flex gap-2">
            <button
              type="button"
              onClick={() => setMuted((value) => !value)}
              aria-pressed={!muted}
              aria-label={muted ? 'Unmute trailer' : 'Mute trailer'}
              className="grid size-10 cursor-pointer place-items-center rounded-full border border-white/20 bg-black/50 text-white backdrop-blur transition-all duration-150 hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            >
              {muted ? (
                <VolumeX className="size-4" aria-hidden="true" />
              ) : (
                <Volume2 className="size-4" aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              ref={closeRef}
              onClick={() => setOpen(false)}
              aria-label="Close trailer"
              className="grid size-10 cursor-pointer place-items-center rounded-full border border-white/20 bg-black/50 text-white backdrop-blur transition-all duration-150 hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
