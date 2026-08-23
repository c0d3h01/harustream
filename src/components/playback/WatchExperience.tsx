'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { encodeRef } from '@/lib/refs';
import { PlayerView } from '@/playback/components/PlayerView';
import { usePlaybackSession } from '@/playback/hooks/usePlaybackSession';
import type { Episode, Media } from '@/types';

export function WatchExperience({
  item,
  initialEpisodeRef,
}: {
  item: Media;
  initialEpisodeRef?: string;
}) {
  const router = useRouter();
  const updateEpisodeUrl = useCallback(
    (episode: Episode) => {
      router.replace(
        `/watch/${encodeURIComponent(item.providerId)}/${encodeRef(item.ref)}?episode=${encodeURIComponent(episode.ref)}`,
      );
    },
    [item.providerId, item.ref, router],
  );
  const session = usePlaybackSession(item, initialEpisodeRef, updateEpisodeUrl);
  const selectEpisode = useCallback(
    (episode: Episode) => {
      session.selectEpisode(episode);
      updateEpisodeUrl(episode);
    },
    [session, updateEpisodeUrl],
  );
  if (session.loading && !session.source) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-black text-sm text-white/80">
        Finding a playable source…
      </div>
    );
  }
  if (session.error && !session.source) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-black px-6 text-center text-white">
        <div>
          <p className="text-lg font-semibold">Playback unavailable</p>
          <p className="mt-2 text-sm text-white/70">{session.error}</p>
          <button
            type="button"
            onClick={() => router.back()}
            className="mt-5 rounded-lg bg-white/15 px-4 py-2 text-sm"
          >
            Back to title
          </button>
        </div>
      </div>
    );
  }
  return (
    <PlayerView
      item={item}
      episodes={session.episodes}
      activeEpisode={session.activeEpisode}
      sources={session.sources}
      source={session.source}
      progress={session.progress}
      onBack={() => router.back()}
      onSource={session.selectSource}
      onSourceFailure={session.sourceFailed}
      onEpisode={selectEpisode}
      onEnded={session.ended}
    />
  );
}
