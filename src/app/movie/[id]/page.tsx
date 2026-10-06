import { notFound } from 'next/navigation';
import { Suspense, ViewTransition } from 'react';
import { Shell } from '@/components/layout/Shell';
import { TmdbDetail } from '@/components/tmdb/TmdbDetail';
import { DirectionalTransition } from '@/components/transitions/DirectionalTransition';
import { ConfigNotice } from '@/components/ui/ConfigNotice';
import { asAppError } from '@/lib/errors';
import { getCollection, getDetails } from '@/tmdb/catalog';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export default async function MoviePage({ params }: Props) {
  const { id } = await params;
  const tmdbId = Number(id);
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) notFound();
  try {
    const detail = await getDetails('movie', tmdbId);
    const collection = detail.collection
      ? await getCollection(detail.collection.id).catch(() => null)
      : null;
    return (
      <Shell>
        <DirectionalTransition>
          <div className="pt-2 sm:pt-4">
            <Suspense fallback={null}>
              <ViewTransition
                key={`tmdb-movie-${tmdbId}`}
                name="tmdb-detail"
                share="auto"
                enter="auto"
                default="none"
              >
                <TmdbDetail detail={detail} collectionParts={collection ?? undefined} />
              </ViewTransition>
            </Suspense>
          </div>
        </DirectionalTransition>
      </Shell>
    );
  } catch (error) {
    const appError = asAppError(error);
    if (appError.code === 'NOT_FOUND') notFound();
    if (appError.code === 'CONFIG') {
      return (
        <Shell>
          <DirectionalTransition>
            <ConfigNotice />
          </DirectionalTransition>
        </Shell>
      );
    }
    throw error;
  }
}
