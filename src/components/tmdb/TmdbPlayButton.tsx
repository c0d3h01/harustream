'use client';

import { Loader2, Play } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { localeHref, useLocale, useT } from '@/lib/i18n';
import { encodeRef } from '@/lib/refs';
import type { ResolveResult } from '@/services/resolve';
import type { TmdbKind } from '@/tmdb/catalog';

interface TmdbPlayButtonProps {
  kind: TmdbKind;
  tmdbId: number;
  title: string;
  originalTitle?: string;
  year?: string;
  /** Hero styling vs compact default. */
  variant?: 'hero' | 'default';
  className?: string;
}

/** Resolves a TMDB title to a provider stream, then plays it.
 *  High-confidence matches auto-play; anything else lands on the detail
 *  page where the picker lives. */
export function TmdbPlayButton({
  kind,
  tmdbId,
  title,
  originalTitle,
  year,
  variant = 'default',
  className,
}: TmdbPlayButtonProps) {
  const router = useRouter();
  const { locale } = useLocale();
  const t = useT();
  const [resolving, setResolving] = useState(false);
  const label = resolving ? t('title.loadingSources') : t('title.play');

  const detailHref = localeHref(locale, `/${kind}/${tmdbId}`);

  const handlePlay = async () => {
    if (resolving) return;
    setResolving(true);
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
      const result = (await response.json()) as ResolveResult;
      if (result.best) {
        router.push(
          localeHref(
            locale,
            `/watch/${encodeURIComponent(result.best.providerId)}/${encodeRef(result.best.ref)}?tmdbKind=${kind}&tmdbId=${tmdbId}`,
          ),
          { transitionTypes: ['nav-forward'] },
        );
        return;
      }
    } catch {
      // Resolution failures land on detail — the picker retries there.
    } finally {
      setResolving(false);
    }
    router.push(detailHref, { transitionTypes: ['nav-forward'] });
  };

  if (variant === 'hero') {
    return (
      <Button
        onClick={handlePlay}
        disabled={resolving}
        nativeButton={true}
        className={`group h-auto gap-3 rounded-full bg-primary pl-5 pr-1.5 py-1.5 text-[0.95rem] font-semibold text-primary-foreground shadow-[0_12px_32px_-12px_rgba(255,255,255,0.4)] transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-primary active:scale-[0.98] ${className ?? ''}`}
      >
        {resolving ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Play className="size-4 fill-current" aria-hidden="true" />
        )}
        {label}
      </Button>
    );
  }

  return (
    <Button
      onClick={handlePlay}
      disabled={resolving}
      aria-busy={resolving}
      className={`h-12 gap-2.5 rounded-xl px-6 font-semibold transition-transform duration-150 active:scale-[0.98] ${className ?? ''}`}
    >
      {resolving ? (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <Play className="size-4 fill-current" aria-hidden="true" />
      )}
      {label}
    </Button>
  );
}
