'use client';

import { Check, ChevronDown, Film, Loader2, Play } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { episodes as fetchEpisodes, sources as fetchSources } from '@/lib/api/client';
import { imageUrl } from '@/lib/media/images';
import { encodeRef } from '@/lib/refs';
import { useLibrary } from '@/lib/storage';
import type { Episode, Media, StreamSource } from '@/types';

export function TitleExperience({ item }: { item: Media }) {
  const router = useRouter();
  const library = useLibrary(item.providerId);
  const [groupIndex, setGroupIndex] = useState(0);
  const [episodeList, setEpisodeList] = useState<Episode[]>([]);
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [sources, setSources] = useState<StreamSource[]>([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const [loadingSources, setLoadingSources] = useState(false);
  const group = item.groups[groupIndex];

  const loadSources = useCallback(
    async (ref: string, kind: string) => {
      setLoadingSources(true);
      setSources([]);
      try {
        setSources(await fetchSources(item.providerId, ref, kind));
      } finally {
        setLoadingSources(false);
      }
    },
    [item.providerId],
  );

  useEffect(() => {
    setEpisodeList([]);
    setEpisode(null);
    setSources([]);
    if (group?.kind !== 'episodes' || !group.ref) return;
    let active = true;
    setLoadingEpisodes(true);
    fetchEpisodes(item.providerId, group.ref)
      .then((result) => {
        if (active) setEpisodeList(result);
      })
      .finally(() => {
        if (active) setLoadingEpisodes(false);
      });
    return () => {
      active = false;
    };
  }, [group, item.providerId]);

  const selectEpisode = (next: Episode) => {
    setEpisode(next);
    void loadSources(next.ref, 'episode');
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.75fr)]">
      <section>
        <div className="relative aspect-[16/7] overflow-hidden rounded-3xl border border-border/70 bg-card">
          {item.posterUrl ? (
            <Image
              src={imageUrl(item.posterUrl)}
              alt=""
              fill
              sizes="(min-width: 1024px) 70vw, 100vw"
              className="object-cover opacity-40 blur-sm"
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
          <div className="absolute inset-x-6 bottom-6 sm:inset-x-10 sm:bottom-10">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              {item.providerId}
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-5xl">
              {item.displayTitle}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              {item.synopsis}
            </p>
            <button
              type="button"
              onClick={() =>
                router.push(
                  `/watch/${encodeURIComponent(item.providerId)}/${encodeRef(item.ref)}${
                    episode ? `?episode=${encodeURIComponent(episode.ref)}` : ''
                  }`,
                )
              }
              disabled={!group || (item.kind === 'movie' && !group.items[0]) || loadingSources}
              className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              {loadingSources ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Play className="size-4 fill-current" />
              )}
              Play now
            </button>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => library.toggle(item)}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border/70 bg-card px-4 text-sm font-medium transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {library.has(item.ref) ? <Check className="size-4 text-primary" /> : null}
            {library.has(item.ref) ? 'Saved to my list' : 'Add to my list'}
          </button>
          <span className="rounded-xl border border-border/70 px-4 py-2 text-sm text-muted-foreground">
            {item.kind === 'series' ? 'Series' : 'Movie'}
          </span>
          {item.rating ? (
            <span className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-2 text-sm text-primary">
              ★ {item.rating}
            </span>
          ) : null}
        </div>
      </section>

      <aside className="space-y-5">
        <section className="rounded-2xl border border-border/70 bg-card/70 p-5">
          <h2 className="font-semibold">Choose a source group</h2>
          <div className="mt-4 space-y-2">
            {item.groups.map((entry, index) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setGroupIndex(index)}
                className={`flex min-h-12 w-full items-center justify-between rounded-xl border px-3 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${index === groupIndex ? 'border-primary bg-primary/10 text-primary' : 'border-border/70 hover:bg-secondary'}`}
              >
                <span>{entry.label}</span>
                <ChevronDown
                  className={`size-4 ${index === groupIndex ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>
        </section>
        {group?.kind === 'episodes' ? (
          <section className="rounded-2xl border border-border/70 bg-card/70 p-5">
            <h2 className="font-semibold">Episodes</h2>
            {loadingEpisodes ? (
              <p className="mt-4 text-sm text-muted-foreground">Loading episodes…</p>
            ) : (
              <div className="mt-4 grid max-h-72 grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4">
                {episodeList.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => selectEpisode(entry)}
                    className={`rounded-lg border px-2 py-2 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${episode?.id === entry.id ? 'border-primary bg-primary/10 text-primary' : 'border-border/70 hover:bg-secondary'}`}
                  >
                    {entry.title}
                  </button>
                ))}
              </div>
            )}
          </section>
        ) : null}
        <SourceList
          sources={sources}
          loading={loadingSources}
          onPlay={() =>
            router.push(
              `/watch/${encodeURIComponent(item.providerId)}/${encodeRef(item.ref)}${
                episode ? `?episode=${encodeURIComponent(episode.ref)}` : ''
              }`,
            )
          }
        />
      </aside>
    </div>
  );
}

function SourceList({
  sources,
  loading,
  onPlay,
}: {
  sources: StreamSource[];
  loading: boolean;
  onPlay: () => void;
}) {
  return (
    <section className="rounded-2xl border border-border/70 bg-card/70 p-5">
      <h2 className="font-semibold">Available sources</h2>
      {loading ? (
        <p className="mt-4 text-sm text-muted-foreground">Resolving provider sources…</p>
      ) : sources.length ? (
        <ul className="mt-4 space-y-2">
          {sources.map((source) => (
            <li
              key={source.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border/70 px-3 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{source.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {source.quality ?? 'Auto'} · {source.format.toUpperCase()}
                </p>
              </div>
              <button
                type="button"
                onClick={onPlay}
                className="rounded-lg bg-secondary px-3 py-2 text-xs font-semibold text-muted-foreground"
                title="Play this title"
              >
                Play
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          <Film className="size-4 shrink-0" aria-hidden="true" />
          Select a group or episode to resolve sources.
        </div>
      )}
    </section>
  );
}
