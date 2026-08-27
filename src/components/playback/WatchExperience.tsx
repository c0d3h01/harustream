'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { PlayerView } from '@/components/playback/PlayerView';
import { usePlaybackSession } from '@/components/playback/usePlaybackSession';
import { localeHref, useLocale, useT } from '@/lib/i18n';
import { encodeRef } from '@/lib/refs';
import type { Episode, Media } from '@/types';

export function WatchExperience({
  item,
  initialEpisodeRef,
}: {
  item: Media;
  initialEpisodeRef?: string;
}) {
  const router = useRouter();
  const t = useT();
  const { locale } = useLocale();
  const updateEpisodeUrl = useCallback(
    (episode: Episode) => {
      router.replace(
        localeHref(
          locale,
          `/watch/${encodeURIComponent(item.providerId)}/${encodeRef(item.ref)}?episode=${encodeURIComponent(episode.ref)}`,
        ),
      );
    },
    [item.providerId, item.ref, locale, router],
  );
  const session = usePlaybackSession(item, initialEpisodeRef, updateEpisodeUrl);

  if (session.loading && !session.source) {
    return (
      <div
        className="fixed inset-0 z-50 grid place-items-center bg-black text-sm text-white/80"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <div className="flex flex-col items-center gap-4">
          <div
            className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin"
            aria-hidden="true"
          ></div>
          <span>{t('watch.findingSource')}</span>
        </div>
      </div>
    );
  }
  if (session.error && !session.source) {
    return (
      <div
        className="fixed inset-0 z-50 grid place-items-center bg-black px-6 text-center text-white"
        role="alert"
      >
        <div>
          <p className="text-lg font-semibold">{t('watch.unavailable')}</p>
          <p className="mt-2 text-sm text-white/70">{session.error}</p>
          <div className="mt-5 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={session.retry}
              className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black touch-target"
            >
              {t('watch.tryAgain')}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="rounded-lg bg-white/15 px-4 py-2 text-sm touch-target"
            >
              {t('watch.backToTitle')}
            </button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <PlayerView
      item={item}
      activeEpisode={session.activeEpisode}
      source={session.source}
      progress={session.progress}
      onSourceFailure={session.sourceFailed}
      onEnded={session.ended}
    />
  );
}
