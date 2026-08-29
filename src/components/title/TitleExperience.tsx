'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, useMemo } from 'react';
import { EpisodeGrid } from '@/components/title/EpisodeGrid';
import { SourceGroupPicker } from '@/components/title/SourceGroupPicker';
import { SourceList } from '@/components/title/SourceList';
import { TitleHeader } from '@/components/title/TitleHeader';
import { episodes as fetchEpisodes, sources as fetchSources } from '@/lib/api/client';
import { localeHref, useLocale, useT } from '@/lib/i18n';
import { encodeRef } from '@/lib/refs';
import type { Episode, Media, StreamSource, MediaGroup } from '@/types';

interface TitleExperienceProps {
  item: Media;
}

function getCanPlay(item: Media, groupIndex: number): boolean {
  const group = item.groups[groupIndex];
  return Boolean(group) && !(item.kind === 'movie' && !group.items[0]);
}

function getInitialEpisodeRef(initialEpisodeRef: string | undefined, group: MediaGroup | undefined): string | undefined {
  return initialEpisodeRef ?? group?.items[0]?.ref;
}

function TitleExperience({ item, initialEpisodeRef }: { item: Media; initialEpisodeRef?: string }) {
  const router = useRouter();
  const t = useT();
  const { locale } = useLocale();

  const [groupIndex, setGroupIndex] = useState(0);
  const [episodeList, setEpisodeList] = useState<Episode[]>([]);
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [sources, setSources] = useState<StreamSource[]>([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const [loadingSources, setLoadingSources] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [episodesError, setEpisodesError] = useState<string | null>(null);

  const group = item.groups[groupIndex];
  const canPlay = getCanPlay(item, groupIndex);

  const loadSources = useCallback(
    async (ref: string, kind: string) => {
      setLoadingSources(true);
      setSources([]);
      setSourceError(null);
      try {
        setSources(await fetchSources(item.providerId, ref, kind));
      } catch (err) {
        setSourceError(err instanceof Error ? err.message : t('title.failedSources'));
      } finally {
        setLoadingSources(false);
      }
    },
    [item.providerId, t],
  );

  const loadEpisodes = useCallback(async () => {
    if (!group?.ref || group.kind !== 'episodes') {
      setEpisodeList([]);
      return;
    }
    setLoadingEpisodes(true);
    setEpisodesError(null);
    try {
      const result = await fetchEpisodes(item.providerId, group.ref);
      setEpisodeList(result);
      const initialRef = getInitialEpisodeRef(initialEpisodeRef, group);
      if (initialRef && !episode) {
        const initialEpisode = result.find((e) => e.ref === initialRef);
        if (initialEpisode) {
          setEpisode(initialEpisode);
          void loadSources(initialEpisode.ref, 'episode');
        }
      }
    } catch (err) {
      setEpisodesError(err instanceof Error ? err.message : t('title.failedEpisodes'));
    } finally {
      setLoadingEpisodes(false);
    }
  }, [item.providerId, group, initialEpisodeRef, episode, loadSources, t]);

  useEffect(() => {
    loadEpisodes();
  }, [loadEpisodes]);

  const selectEpisode = useCallback(
    (next: Episode) => {
      setEpisode(next);
      void loadSources(next.ref, 'episode');
    },
    [loadSources],
  );

  const handlePlay = useCallback(() => {
    router.push(
      localeHref(
        locale,
        `/watch/${encodeURIComponent(item.providerId)}/${encodeRef(item.ref)}${
          episode ? `?episode=${encodeURIComponent(episode.ref)}` : ''
        }`,
      ),
    );
  }, [router, locale, item.providerId, item.ref, episode]);

  const groupContent = useMemo(() => {
    if (group?.kind === 'episodes') {
      return (
        <section>
          <EpisodeGrid
            loading={loadingEpisodes}
            error={episodesError}
            episodes={episodeList}
            selectedId={episode?.id}
            onSelect={selectEpisode}
          />
        </section>
      );
    }
    return null;
  }, [group, loadingEpisodes, episodesError, episodeList, episode, selectEpisode]);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.75fr)]">
      <section>
        <TitleHeader
          item={item}
          canPlay={canPlay}
          loadingSources={loadingSources}
          onPlay={handlePlay}
        />
      </section>

      <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
        <section>
          <SourceGroupPicker
            groups={item.groups}
            selectedIndex={groupIndex}
            onSelect={setGroupIndex}
          />
        </section>

        {groupContent}

        <section>
          <SourceList
            loading={loadingSources}
            error={sourceError}
            sources={sources}
            onPlay={handlePlay}
          />
        </section>
      </aside>
    </div>
  );
}

export { TitleExperience };