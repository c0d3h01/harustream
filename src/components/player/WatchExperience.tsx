'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { localeHref, useLocale, useT } from '@/lib/i18n';
import { encodeRef } from '@/lib/refs';
import type { Episode, Media } from '@/types';
import { EpisodeSelector } from './EpisodeSelector';
import { PlayerEngine } from './PlayerEngine';
import { SourceSelector } from './SourceSelector';
import { usePlaybackSession } from './usePlaybackSession';

type Panel = 'episodes' | 'sources' | null;

export function WatchExperience({
  item,
  initialEpisodeRef,
  tmdbContext,
}: {
  item: Media;
  initialEpisodeRef?: string;
  tmdbContext?: { kind: string; id: number };
}) {
  const router = useRouter();
  const t = useT();
  const { locale } = useLocale();
  const [panel, setPanel] = useState<Panel>(null);

  const updateEpisodeUrl = useCallback(
    (episode: Episode) => {
      const params = new URLSearchParams({ episode: episode.ref });
      if (tmdbContext) {
        params.set('tmdbKind', tmdbContext.kind);
        params.set('tmdbId', String(tmdbContext.id));
      }
      router.replace(
        localeHref(
          locale,
          `/watch/${encodeURIComponent(item.providerId)}/${encodeRef(item.ref)}?${params.toString()}`,
        ),
      );
    },
    [item.providerId, item.ref, locale, router, tmdbContext],
  );
  const session = usePlaybackSession(item, initialEpisodeRef, updateEpisodeUrl);

  if (session.loading && !session.variant) {
    return (
      <div
        className="fixed inset-0 z-50 grid place-items-center bg-black text-sm text-white/80"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <div className="flex flex-col items-center gap-4">
          <div
            className="size-10 animate-spin rounded-full border-2 border-white/20 border-t-white sm:size-12"
            aria-hidden="true"
          />
          <span>{t('watch.findingSource')}</span>
        </div>
      </div>
    );
  }
  if (session.error && !session.variant) {
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
              className="touch-target rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black transition-transform duration-150 hover:scale-[1.03] active:scale-95"
            >
              {t('watch.tryAgain')}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="rounded-lg bg-white/15 px-4 py-2 text-sm touch-target transition-transform duration-150 hover:bg-white/20 active:scale-95"
            >
              {t('watch.backToTitle')}
            </button>
          </div>
        </div>
      </div>
    );
  }
  if (!session.activeEpisode || !session.variant) return null;

  const episodeIndex = session.episodes.findIndex(
    (entry) => entry.id === session.activeEpisode?.id,
  );
  const hasPrevEpisode = episodeIndex > 0;
  const hasNextEpisode = episodeIndex >= 0 && episodeIndex < session.episodes.length - 1;

  return (
    <>
      <PlayerEngine
        item={item}
        activeEpisode={session.activeEpisode}
        variant={session.variant}
        allVariantsCount={session.allVariants.length}
        hasPrevEpisode={hasPrevEpisode}
        hasNextEpisode={hasNextEpisode}
        progress={session.progress}
        onVariantFailed={session.variantFailed}
        onEnded={session.ended}
        onPrevEpisode={() => {
          if (hasPrevEpisode) session.selectEpisode(session.episodes[episodeIndex - 1]);
        }}
        onNextEpisode={() => {
          if (hasNextEpisode) session.selectEpisode(session.episodes[episodeIndex + 1]);
        }}
        onToggleEpisodes={() => setPanel(panel === 'episodes' ? null : 'episodes')}
        onToggleSources={() => setPanel(panel === 'sources' ? null : 'sources')}
        episodesOpen={panel === 'episodes'}
        sourcesOpen={panel === 'sources'}
        onRetry={session.retry}
        onClose={() => router.back()}
      />
      <EpisodeSelector
        open={panel === 'episodes'}
        episodes={session.episodes}
        activeEpisodeId={session.activeEpisode.id}
        onSelect={(episode) => {
          session.selectEpisode(episode);
          setPanel(null);
        }}
        onClose={() => setPanel(null)}
      />
      <SourceSelector
        open={panel === 'sources'}
        variants={session.allVariants}
        activeVariantId={session.variant.variantId}
        failedVariantIds={session.failedVariantIds}
        onSelect={(variantId) => {
          session.selectVariant(variantId);
          setPanel(null);
        }}
        onClose={() => setPanel(null)}
      />
    </>
  );
}
