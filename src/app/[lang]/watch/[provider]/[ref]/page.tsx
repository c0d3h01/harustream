import { notFound } from 'next/navigation';
import { Shell } from '@/components/layout/Shell';
import { WatchExperience } from '@/components/playback/WatchExperience';
import { WatchLoadError } from '@/components/playback/WatchLoadError';
import { DirectionalTransition } from '@/components/transitions/DirectionalTransition';
import { asAppError } from '@/lib/errors';
import { decodeRef } from '@/lib/refs';
import { media } from '@/services/media';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ provider: string; ref: string }>;
  searchParams: Promise<{ episode?: string; tmdbKind?: string; tmdbId?: string }>;
};

export default async function WatchPage({ params, searchParams }: Props) {
  const [{ provider, ref: encodedRef }, query] = await Promise.all([params, searchParams]);
  // TMDB passthrough (§8): preserved across episode switches so future
  // library saves and progress entries can capture TMDB context.
  const tmdbId = Number(query.tmdbId);
  const tmdb =
    (query.tmdbKind === 'movie' || query.tmdbKind === 'tv') &&
    Number.isInteger(tmdbId) &&
    tmdbId > 0
      ? { kind: query.tmdbKind, id: tmdbId }
      : undefined;
  let item: Awaited<ReturnType<typeof media>>;
  try {
    item = await media(decodeURIComponent(provider), decodeRef(encodedRef));
  } catch (error) {
    if (asAppError(error).code === 'NOT_FOUND') notFound();
    return (
      <Shell>
        <DirectionalTransition>
          <WatchLoadError />
        </DirectionalTransition>
      </Shell>
    );
  }
  // Fullscreen player — hierarchical forward from title (nav-forward slides
  // the snapshot; the fixed player itself renders instantly, no entrance).
  return (
    <DirectionalTransition>
      <WatchExperience
        item={item}
        initialEpisodeRef={query.episode ? decodeURIComponent(query.episode) : undefined}
        tmdbContext={tmdb}
      />
    </DirectionalTransition>
  );
}
