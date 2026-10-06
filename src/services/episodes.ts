import type { Episode, Media } from '@/types/media';
import { rawEpisodeSchema } from '@/validations/provider';
import { toEpisode } from './normalize';
import { cached, callProvider } from './provider';

/**
 * The playable list for a title, resolved on the server so the watch page ships
 * it in its payload instead of the browser asking for it.
 */
export function episodesFor(item: Media, signal?: AbortSignal): Promise<Episode[]> {
  if (item.kind === 'movie') {
    const first = item.groups.flatMap((group) => group.items)[0];
    return Promise.resolve(first ? [{ id: first.id, title: first.label, ref: first.ref }] : []);
  }

  const direct = item.groups.find((group) => group.kind === 'direct' && group.items.length);
  if (direct) {
    return Promise.resolve(
      direct.items.map((entry) => ({ id: entry.id, title: entry.label, ref: entry.ref })),
    );
  }

  const group = item.groups.find((entry) => entry.kind === 'episodes' && entry.ref);
  if (!group?.ref) return Promise.resolve([]);

  return cached(
    `episodes:${item.providerId}:${group.ref}`,
    60_000,
    () =>
      callProvider({
        providerId: item.providerId,
        op: 'episodes',
        schema: rawEpisodeSchema.array(),
        invoke: (provider, providerSignal) =>
          provider.getEpisodes?.({ url: group.ref as string, signal: providerSignal }) ??
          Promise.resolve([]),
        map: (parsed) => parsed.map((episode) => toEpisode(episode, item.providerId)),
      }),
    signal,
  );
}
