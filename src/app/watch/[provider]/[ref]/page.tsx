import { notFound } from 'next/navigation';
import { Shell } from '@/components/layout/Shell';
import { WatchExperience } from '@/components/player/WatchExperience';
import { WatchLoadError } from '@/components/player/WatchLoadError';
import { DirectionalTransition } from '@/components/transitions/DirectionalTransition';
import { decodeBase64Url } from '@/lib/base64url';
import { TtlCache } from '@/lib/cache';
import { asAppError } from '@/lib/errors';
import { toMedia } from '@/services/normalize';
import { callProvider } from '@/services/provider';
import type { Media } from '@/types/media';
import { rawInfoSchema } from '@/validations/provider';

export const dynamic = 'force-dynamic';

// Module scope: the key (provider + ref) carries no per-visitor data, so this
// safely shares metadata across requests for 60s — notably the title → watch
// hop, which otherwise refetches the same item.
const mediaCache = new TtlCache<Media>();

type Props = {
  params: Promise<{ provider: string; ref: string }>;
  searchParams: Promise<{ episode?: string; tmdbKind?: string; tmdbId?: string }>;
};

export default async function WatchPage({ params, searchParams }: Props) {
  const [{ provider, ref: encodedRef }, query] = await Promise.all([params, searchParams]);
  const tmdbId = Number(query.tmdbId);
  const tmdb =
    (query.tmdbKind === 'movie' || query.tmdbKind === 'tv') &&
    Number.isInteger(tmdbId) &&
    tmdbId > 0
      ? { kind: query.tmdbKind, id: tmdbId }
      : undefined;
  let item: Media;
  try {
    item = await callProvider({
      providerId: decodeURIComponent(provider),
      op: 'metadata',
      schema: rawInfoSchema,
      invoke: (p, signal) => p.getMeta({ link: decodeBase64Url(encodedRef), signal }),
      map: (parsed, p) => toMedia(parsed, p.id, decodeBase64Url(encodedRef)),
      cache: { store: mediaCache, key: `media:${provider}:${encodedRef}`, ttlMs: 60_000 },
      signal: undefined,
    });
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
