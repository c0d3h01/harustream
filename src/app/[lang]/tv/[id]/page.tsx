import { notFound } from 'next/navigation';
import { Suspense, ViewTransition } from 'react';
import { Shell } from '@/components/layout/Shell';
import { TmdbConfigNotice } from '@/components/tmdb/TmdbConfigNotice';
import { TmdbDetail } from '@/components/tmdb/TmdbDetail';
import { DirectionalTransition } from '@/components/transitions/DirectionalTransition';
import { asAppError } from '@/lib/errors';
import { hasLocale } from '@/lib/i18n';
import { getTvDetails } from '@/tmdb/catalog';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ lang: string; id: string }> };

export default async function TvPage({ params }: Props) {
  const { lang, id } = await params;
  const tmdbId = Number(id);
  if (!hasLocale(lang) || !Number.isInteger(tmdbId) || tmdbId <= 0) notFound();
  try {
    const detail = await getTvDetails(lang, tmdbId);
    return (
      <Shell>
        <DirectionalTransition>
          <div className="pt-2 sm:pt-4">
            <Suspense fallback={null}>
              <ViewTransition
                key={`tmdb-tv-${tmdbId}`}
                name="tmdb-detail"
                share="auto"
                enter="auto"
                default="none"
              >
                <TmdbDetail detail={detail} />
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
            <TmdbConfigNotice />
          </DirectionalTransition>
        </Shell>
      );
    }
    throw error;
  }
}
