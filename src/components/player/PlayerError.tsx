'use client';

import { AlertTriangle, RotateCcw, Server } from 'lucide-react';
import { useT } from '@/lib/i18n';
import type { PlayerErrorInfo } from './types';

export interface PlayerErrorProps {
  error: PlayerErrorInfo;
  hasOtherSources: boolean;
  onRetry: () => void;
  onOpenSources: () => void;
  onClose?: () => void;
}

/** Every terminal error always offers an explicit action — retrying the
 *  same variant, opening the source selector, or leaving. Nothing here
 *  auto-switches; source exhaustion and expired tokens both land the user
 *  here with a choice, never a silent fallback. */
export function PlayerError({
  error,
  hasOtherSources,
  onRetry,
  onOpenSources,
  onClose,
}: PlayerErrorProps) {
  const t = useT();
  const heading =
    error.kind === 'expired'
      ? 'This playback link expired'
      : error.kind === 'unsupported'
        ? 'This format isn\u2019t supported by your browser'
        : error.kind === 'network'
          ? 'Lost connection to this source'
          : error.kind === 'decode'
            ? 'This source could not be played'
            : 'Playback failed';

  return (
    <div
      className="absolute inset-0 z-[110] grid place-items-center bg-black/70 px-6 text-center text-white"
      role="alert"
    >
      <div className="max-w-sm">
        <AlertTriangle className="mx-auto size-8 text-amber-400" aria-hidden="true" />
        <p className="mt-4 text-lg font-semibold">{heading}</p>
        <p className="mt-2 text-sm text-white/70">{error.message}</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={onRetry}
            className="touch-target inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black transition-transform duration-150 hover:scale-[1.03] active:scale-95"
          >
            <RotateCcw size={16} aria-hidden="true" />
            {t('watch.tryAgain')}
          </button>
          {hasOtherSources ? (
            <button
              type="button"
              onClick={onOpenSources}
              className="touch-target inline-flex items-center gap-2 rounded-xl bg-white/15 px-4 py-2.5 text-sm font-semibold transition-transform duration-150 hover:bg-white/20 active:scale-95"
            >
              <Server size={16} aria-hidden="true" />
              {t('player.sourcePicker')}
            </button>
          ) : null}
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-white/10 px-4 py-2 text-sm touch-target transition-transform duration-150 hover:bg-white/15 active:scale-95"
            >
              {t('watch.backToTitle')}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
