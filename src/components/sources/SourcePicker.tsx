'use client';

import { Play, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { watchHref } from '@/lib/routes';
import type { ScoredCandidate } from '@/services/resolve';
import type { TmdbKind } from '@/tmdb/catalog';
import { CandidateList } from './CandidateList';
import { type ResolveState, useResolveCandidates } from './useResolveCandidates';

function CandidateSkeleton() {
  return (
    <div role="status" aria-label="Finding a playable stream">
      <span className="sr-only">{'Finding a playable stream…'}</span>
      <ul className="space-y-2" aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <li
            key={index}
            className="flex min-h-16 animate-pulse items-center gap-3 rounded-lg border border-border px-3 py-2.5"
          >
            <div className="size-12 shrink-0 rounded-md bg-muted" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-24 rounded-md bg-muted" />
              <div className="h-3.5 w-3/4 rounded-md bg-muted" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ResolveError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-lg border border-border px-4 py-5 text-center">
      <p className="text-sm text-muted-foreground">{"Couldn't reach providers"}</p>
      <Button variant="outline" size="sm" onClick={onRetry} className="mt-3 gap-1.5">
        <RotateCcw className="size-3.5" aria-hidden="true" />
        {'Try again'}
      </Button>
    </div>
  );
}

interface SourcePickerProps {
  kind: TmdbKind;
  tmdbId: number;
  title: string;
  originalTitle?: string;
  year?: string;
  fallbackPosterUrl?: string;
  presentation: 'popover' | 'inline';
  className?: string;
}

export function SourcePicker({
  kind,
  tmdbId,
  title,
  originalTitle,
  year,
  fallbackPosterUrl,
  presentation,
  className,
}: SourcePickerProps) {
  const router = useRouter();
  const { state, load } = useResolveCandidates(kind, tmdbId, title, originalTitle, year);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (presentation === 'inline') load();
  }, [presentation, load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  const play = useCallback(
    (candidate: ScoredCandidate) => {
      router.push(
        `${watchHref(candidate.providerId, candidate.ref)}?tmdbKind=${kind}&tmdbId=${tmdbId}`,
        { transitionTypes: ['nav-forward'] },
      );
    },
    [kind, router, tmdbId],
  );

  if (presentation === 'inline') {
    return (
      <ResolveBody
        state={state}
        onRetry={load}
        kind={kind}
        tmdbId={tmdbId}
        fallbackPosterUrl={fallbackPosterUrl}
        onPlay={play}
      />
    );
  }

  const dialogId = `source-picker-${kind}-${tmdbId}`;
  return (
    <div className="relative">
      <Button
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        aria-haspopup="dialog"
        onClick={() => {
          setOpen((current) => !current);
          load();
        }}
        onMouseEnter={load}
        onFocus={load}
        className={`h-12 gap-2.5 rounded-lg bg-primary px-6 text-[0.95rem] font-semibold text-primary-foreground transition-all duration-300 active:scale-[0.98] ${className ?? ''}`}
      >
        <Play className="size-4 fill-current" aria-hidden="true" />
        {'Watch'}
      </Button>
      {open ? (
        <div
          id={dialogId}
          role="dialog"
          aria-label={'Choose a source'}
          className="absolute left-0 top-2 z-50 w-[min(22rem,calc(100vw-2.5rem))] max-w-[calc(100vw-2.5rem)] rounded-xl border border-border bg-card p-2 shadow-[0_24px_64px_-24px_rgba(0,0,0,0.18)] outline-none"
        >
          <ResolveBody
            state={state}
            onRetry={load}
            kind={kind}
            tmdbId={tmdbId}
            fallbackPosterUrl={fallbackPosterUrl}
            onPlay={play}
          />
        </div>
      ) : null}
    </div>
  );
}

function ResolveBody({
  state,
  onRetry,
  kind,
  tmdbId,
  fallbackPosterUrl,
  onPlay,
}: {
  state: ResolveState;
  onRetry: () => void;
  kind: TmdbKind;
  tmdbId: number;
  fallbackPosterUrl?: string;
  onPlay: (candidate: ScoredCandidate) => void;
}) {
  if (state.status === 'idle' || state.status === 'loading') return <CandidateSkeleton />;
  if (state.status === 'error') return <ResolveError onRetry={onRetry} />;
  return (
    <CandidateList
      candidates={state.body.candidates}
      best={state.body.best}
      tmdb={{ kind, id: tmdbId }}
      fallbackPosterUrl={fallbackPosterUrl}
      onPlay={onPlay}
    />
  );
}
