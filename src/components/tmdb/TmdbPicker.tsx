'use client';

import { Loader2, Play } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { localeHref, useLocale, useT } from '@/lib/i18n';
import { encodeRef } from '@/lib/refs';
import type { ResolveCandidate } from '@/services/resolve';
import type { TmdbKind } from '@/tmdb/catalog';
import { ProviderBadge } from './ProviderBadge';

interface TmdbPickerProps {
  kind: TmdbKind;
  tmdbId: number;
  title: string;
  originalTitle?: string;
  year?: string;
}

type PickerState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; candidates: ResolveCandidate[] }
  | { status: 'error' };

/** Manual fallback when auto-resolve can't confidently match: lists every
 *  provider hit so the user picks the stream. Each row plays directly. */
export function TmdbPicker({ kind, tmdbId, title, originalTitle, year }: TmdbPickerProps) {
  const router = useRouter();
  const { locale } = useLocale();
  const t = useT();
  const [state, setState] = useState<PickerState>({ status: 'idle' });

  const play = (candidate: ResolveCandidate) => {
    router.push(
      localeHref(
        locale,
        `/watch/${encodeURIComponent(candidate.providerId)}/${encodeRef(candidate.ref)}?tmdbKind=${kind}&tmdbId=${tmdbId}`,
      ),
      { transitionTypes: ['nav-forward'] },
    );
  };

  const find = async () => {
    setState({ status: 'loading' });
    try {
      const params = new URLSearchParams({
        kind,
        tmdbId: String(tmdbId),
        title,
        ...(originalTitle ? { originalTitle } : {}),
        ...(year ? { year } : {}),
      });
      const response = await fetch(`/api/resolve?${params.toString()}`);
      if (!response.ok) throw new Error(`resolve failed: ${response.status}`);
      const result = (await response.json()) as { candidates: ResolveCandidate[] };
      setState({ status: 'ready', candidates: result.candidates });
    } catch {
      setState({ status: 'error' });
    }
  };

  if (state.status === 'idle' || state.status === 'loading' || state.status === 'error') {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          onClick={find}
          disabled={state.status === 'loading'}
          className="h-11 rounded-xl px-5 font-semibold transition-transform duration-150 active:scale-[0.97]"
        >
          {state.status === 'loading' ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : null}
          {state.status === 'loading' ? t('tmdb.findingStream') : t('tmdb.findStream')}
        </Button>
        {state.status === 'error' ? (
          <p className="text-sm text-muted-foreground" role="alert">
            {t('tmdb.noStream')}
          </p>
        ) : null}
      </div>
    );
  }

  if (state.candidates.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        {t('tmdb.noStream')}
      </p>
    );
  }

  return (
    <ul className="space-y-2" aria-label={t('tmdb.chooseSource')}>
      {state.candidates.map((candidate) => (
        <li
          key={`${candidate.providerId}:${candidate.ref}`}
          className="flex items-center justify-between gap-3 rounded-xl border border-border/70 px-3.5 py-2"
        >
          <div className="flex min-w-0 items-center gap-3">
            <ProviderBadge
              providerId={candidate.providerId}
              providerName={candidate.providerName}
            />
            <p className="truncate text-sm font-medium">{candidate.label}</p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => play(candidate)}
            className="h-10 shrink-0 gap-1.5 px-3.5 text-xs font-semibold transition-transform duration-150 active:scale-95"
          >
            <Play className="fill-current" aria-hidden="true" />
            {t('title.play')}
          </Button>
        </li>
      ))}
    </ul>
  );
}
