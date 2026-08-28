'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { EpisodeGrid } from '@/components/title/EpisodeGrid';
import { SourceGroupPicker } from '@/components/title/SourceGroupPicker';
import { SourceList } from '@/components/title/SourceList';
import { TitleHeader } from '@/components/title/TitleHeader';
import { episodes as fetchEpisodes, sources as fetchSources } from '@/lib/api/client';
import { localeHref, useLocale, useT } from '@/lib/i18n';
import { encodeRef } from '@/lib/refs';
import type { Episode, Media, StreamSource } from '@/types';

/** Orchestrates title state (group → episodes → sources) and composes the
 *  presentational pieces. Rendering lives in TitleHeader / SourceGroupPicker /
 *  EpisodeGrid / SourceList. */
export function TitleExperience({ item }: { item: Media }) {
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

  useEffect(() => {
    setEpisodeList([]);
    setEpisode(null);
    setSources([]);
    setSourceError(null);
    setEpisodesError(null);
    if (group?.kind !== 'episodes' || !group.ref) return;
    let active = true;
    setLoadingEpisodes(true);
    fetchEpisodes(item.providerId, group.ref)
      .then((result) => {
        if (active) setEpisodeList(result);
      })
      .catch((err: unknown) => {
        if (active) {
          setEpisodesError(err instanceof Error ? err.message : t('title.failedEpisodes'));
        }
      })
      .finally(() => {
        if (active) setLoadingEpisodes(false);
      });
    return () => {
      active = false;
    };
  }, [group, item.providerId, t]);

  const selectEpisode = (next: Episode) => {
    setEpisode(next);
    void loadSources(next.ref, 'episode');
  };

  const handlePlay = () =>
    router.push(
      localeHref(
        locale,
        `/watch/${encodeURIComponent(item.providerId)}/${encodeRef(item.ref)}${
          episode ? `?episode=${encodeURIComponent(episode.ref)}` : ''
        }`,
      ),
    );

  const canPlay = Boolean(group) && !(item.kind === 'movie' && !group.items[0]);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.75fr)]">
      {/* ── Left column: poster + info ── */}
      <section>
        <TitleHeader
          item={item}
          canPlay={canPlay}
          loadingSources={loadingSources}
          onPlay={handlePlay}
        />
      </section>

      {/* ── Right column: source selection + episodes + sources ── */}
      <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
        <section>
          <SourceGroupPicker
            groups={item.groups}
            selectedIndex={groupIndex}
            onSelect={setGroupIndex}
          />
        </section>

        {group?.kind === 'episodes' ? (
          <section>
            <EpisodeGrid
              loading={loadingEpisodes}
              error={episodesError}
              episodes={episodeList}
              selectedId={episode?.id}
              onSelect={selectEpisode}
            />
          </section>
        ) : null}

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
