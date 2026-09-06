'use client';

// Replaces the previous TmdbPlayButton + TmdbPicker split. Neither
// presentation here ever navigates on its own — clicking Play always shows
// every channel that plausibly carries the title before anything plays.
// See docs/superpowers/specs/2026-09-06-streaming-player-rebuild-design.md
// §11 for why: fuzzy TMDB-to-provider title matching can't be certain
// (remakes, dubs, wrong season), and this app aggregates channels rather
// than being a TMDB-driven guesser.
import { Loader2, Play } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { localeHref, useLocale, useT } from '@/lib/i18n';
import { imageUrl } from '@/lib/media/images';
import { encodeRef } from '@/lib/refs';
import type { ResolveCandidate } from '@/services/resolve';
import type { TmdbKind } from '@/tmdb/catalog';
import { ProviderBadge } from './ProviderBadge';

interface ResolveBody {
  best: ResolveCandidate | null;
  candidates: ResolveCandidate[];
}

// Browser-tab-local only — never shared across users or requests. Reopening
// the same title's picker twice in one session skips the network round trip
// instead of resolving again.
const resolveCache = new Map<string, Promise<ResolveBody>>();

function resolveKey(kind: TmdbKind, tmdbId: number): string {
  return `${kind}:${tmdbId}`;
}

function fetchResolve(
  kind: TmdbKind,
  tmdbId: number,
  title: string,
  originalTitle?: string,
  year?: string,
): Promise<ResolveBody> {
  const key = resolveKey(kind, tmdbId);
  const cached = resolveCache.get(key);
  if (cached) return cached;
  const params = new URLSearchParams({
    kind,
    tmdbId: String(tmdbId),
    title,
    ...(originalTitle ? { originalTitle } : {}),
    ...(year ? { year } : {}),
  });
  const promise = fetch(`/api/resolve?${params.toString()}`)
    .then((response) => {
      if (!response.ok) throw new Error(`resolve failed (${response.status})`);
      return response.json() as Promise<ResolveBody>;
    })
    .catch((error: unknown) => {
      resolveCache.delete(key);
      throw error;
    });
  resolveCache.set(key, promise);
  return promise;
}

type FetchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; body: ResolveBody }
  | { status: 'error' };

function useResolveCandidates(
  kind: TmdbKind,
  tmdbId: number,
  title: string,
  originalTitle?: string,
  year?: string,
) {
  const [state, setState] = useState<FetchState>({ status: 'idle' });

  const load = useCallback(() => {
    if (state.status === 'loading' || state.status === 'ready') return;
    setState({ status: 'loading' });
    fetchResolve(kind, tmdbId, title, originalTitle, year)
      .then((body) => setState({ status: 'ready', body }))
      .catch(() => setState({ status: 'error' }));
  }, [kind, tmdbId, title, originalTitle, year, state.status]);

  return { state, load };
}

interface CandidateRowProps {
  candidate: ResolveCandidate;
  isBest: boolean;
  fallbackPosterUrl?: string;
  onPlay: (candidate: ResolveCandidate) => void;
}

function CandidateRow({ candidate, isBest, fallbackPosterUrl, onPlay }: CandidateRowProps) {
  const t = useT();
  const thumb = candidate.posterUrl ?? fallbackPosterUrl;
  return (
    <li className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-muted">
      {thumb ? (
        <Image
          src={imageUrl(thumb)}
          alt=""
          width={40}
          height={40}
          className="size-10 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <div className="size-10 shrink-0 rounded-lg bg-muted" aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <ProviderBadge providerId={candidate.providerId} providerName={candidate.providerName} />
          {isBest ? (
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-primary">
              {t('tmdb.bestMatch')}
            </span>
          ) : null}
        </div>
        <p className="mt-1 truncate text-sm font-medium">{candidate.label}</p>
      </div>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => onPlay(candidate)}
        className="h-9 shrink-0 gap-1.5 px-3 text-xs font-semibold"
      >
        <Play className="fill-current" aria-hidden="true" />
        {t('title.play')}
      </Button>
    </li>
  );
}

function CandidateList({
  state,
  fallbackPosterUrl,
  onPlay,
  bestRef,
}: {
  state: FetchState;
  fallbackPosterUrl?: string;
  onPlay: (candidate: ResolveCandidate) => void;
  bestRef: ResolveCandidate | null;
}) {
  const t = useT();
  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <div className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        {t('tmdb.findingStream')}
      </div>
    );
  }
  if (state.status === 'error') {
    return <p className="px-2 py-3 text-sm text-muted-foreground">{t('tmdb.noStream')}</p>;
  }
  if (state.body.candidates.length === 0) {
    return <p className="px-2 py-3 text-sm text-muted-foreground">{t('tmdb.noStream')}</p>;
  }
  return (
    <ul className="space-y-1" aria-label={t('tmdb.chooseSource')}>
      {state.body.candidates.map((candidate) => (
        <CandidateRow
          key={`${candidate.providerId}:${candidate.ref}`}
          candidate={candidate}
          isBest={bestRef?.providerId === candidate.providerId && bestRef?.ref === candidate.ref}
          fallbackPosterUrl={fallbackPosterUrl}
          onPlay={onPlay}
        />
      ))}
    </ul>
  );
}

interface TmdbSourcePickerProps {
  kind: TmdbKind;
  tmdbId: number;
  title: string;
  originalTitle?: string;
  year?: string;
  fallbackPosterUrl?: string;
  presentation: 'popover' | 'inline';
  triggerVariant?: 'hero' | 'default';
  className?: string;
}

export function TmdbSourcePicker({
  kind,
  tmdbId,
  title,
  originalTitle,
  year,
  fallbackPosterUrl,
  presentation,
  triggerVariant = 'default',
  className,
}: TmdbSourcePickerProps) {
  const t = useT();
  const router = useRouter();
  const { locale } = useLocale();
  const { state, load } = useResolveCandidates(kind, tmdbId, title, originalTitle, year);

  const play = useCallback(
    (candidate: ResolveCandidate) => {
      router.push(
        localeHref(
          locale,
          `/watch/${encodeURIComponent(candidate.providerId)}/${encodeRef(candidate.ref)}?tmdbKind=${kind}&tmdbId=${tmdbId}`,
        ),
        { transitionTypes: ['nav-forward'] },
      );
    },
    [kind, locale, router, tmdbId],
  );

  if (presentation === 'inline') {
    return (
      <InlineList
        kind={kind}
        state={state}
        load={load}
        fallbackPosterUrl={fallbackPosterUrl}
        onPlay={play}
      />
    );
  }

  return (
    <Popover onOpenChange={(open) => open && load()}>
      <PopoverTrigger
        render={
          triggerVariant === 'hero' ? (
            <Button
              nativeButton={true}
              onMouseEnter={load}
              onFocus={load}
              className={`group h-auto gap-3 rounded-full bg-primary pl-5 pr-1.5 py-1.5 text-[0.95rem] font-semibold text-primary-foreground shadow-[0_12px_32px_-12px_rgba(255,255,255,0.4)] transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-primary active:scale-[0.98] ${className ?? ''}`}
            />
          ) : (
            <Button
              onMouseEnter={load}
              onFocus={load}
              className={`h-10 gap-2 rounded-full px-4 text-sm font-semibold transition-transform duration-150 active:scale-[0.98] ${className ?? ''}`}
            />
          )
        }
      >
        <Play className="size-4 fill-current" aria-hidden="true" />
        {t('title.play')}
      </PopoverTrigger>
      <PopoverContent aria-label={t('tmdb.chooseSource')}>
        <CandidateList
          state={state}
          fallbackPosterUrl={fallbackPosterUrl}
          onPlay={play}
          bestRef={state.status === 'ready' ? state.body.best : null}
        />
      </PopoverContent>
    </Popover>
  );
}

function InlineList({
  state,
  load,
  fallbackPosterUrl,
  onPlay,
}: {
  kind: TmdbKind;
  state: FetchState;
  load: () => void;
  fallbackPosterUrl?: string;
  onPlay: (candidate: ResolveCandidate) => void;
}) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: fetch once on mount only — the user already navigated here with intent to watch, so this is a prefetch, not a hidden auto-play.
  useEffect(() => {
    load();
  }, []);
  return (
    <CandidateList
      state={state}
      fallbackPosterUrl={fallbackPosterUrl}
      onPlay={onPlay}
      bestRef={state.status === 'ready' ? state.body.best : null}
    />
  );
}
