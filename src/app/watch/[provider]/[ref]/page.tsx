import { notFound } from 'next/navigation';
import { Shell } from '@/components/layout/Shell';
import { WatchExperience } from '@/components/playback/WatchExperience';
import { asAppError } from '@/lib/errors';
import { decodeRef } from '@/lib/refs';
import { media } from '@/services/media';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ provider: string; ref: string }>;
  searchParams: Promise<{ episode?: string }>;
};

export default async function WatchPage({ params, searchParams }: Props) {
  const [{ provider, ref: encodedRef }, query] = await Promise.all([params, searchParams]);
  let item: Awaited<ReturnType<typeof media>>;
  try {
    item = await media(decodeURIComponent(provider), decodeRef(encodedRef));
  } catch (error) {
    if (asAppError(error).code === 'NOT_FOUND') notFound();
    return (
      <Shell>
        <div className="pt-12 text-center text-sm text-muted-foreground">
          Playback could not load.
        </div>
      </Shell>
    );
  }
  return (
    <WatchExperience
      item={item}
      initialEpisodeRef={query.episode ? decodeURIComponent(query.episode) : undefined}
    />
  );
}
