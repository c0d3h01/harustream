import { notFound } from 'next/navigation';
import { Shell } from '@/components/layout/Shell';
import { WatchExperience } from '@/components/player/WatchExperience';
import { WatchLoadError } from '@/components/player/WatchLoadError';
import { DirectionalTransition } from '@/components/transitions/DirectionalTransition';
import { decodeBase64Url } from '@/lib/base64url';
import { asAppError } from '@/lib/errors';
import { toMedia } from '@/services/normalize';
import { cached, callProvider } from '@/services/provider';
import type { Media } from '@/types/media';
import { rawInfoSchema } from '@/validations/provider';

export const dynamic = 'force-dynamic';

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
    item = await cached(`media:${provider}:${encodedRef}`, 60_000, () =>
      callProvider({
        providerId: decodeURIComponent(provider),
        op: 'metadata',
        schema: rawInfoSchema,
        invoke: (p, signal) => p.getMeta({ link: decodeBase64Url(encodedRef), signal }),
        map: (parsed, p) => toMedia(parsed, p.id, decodeBase64Url(encodedRef)),
      }),
    );
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
