import { NextResponse } from 'next/server';
import { apiErrorResponse, requestIdOf } from '@/lib/api/respond';
import { AppError } from '@/lib/errors';
import { getMovieDetails, getTvDetails } from '@/tmdb/catalog';
import { previewQuery } from '@/validations/api';

export const dynamic = 'force-dynamic';

/** Mini-details for the card hover tooltip. Detail fetches are
 *  server-cached, so repeated hovers cost nothing upstream. */
export async function GET(request: Request) {
  const requestId = requestIdOf(request);
  const parsed = previewQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) {
    return apiErrorResponse(new AppError('BAD_REQUEST', 'Invalid preview query'), requestId);
  }
  try {
    const { kind, tmdbId } = parsed.data;
    const detail =
      kind === 'movie' ? await getMovieDetails('en', tmdbId) : await getTvDetails('en', tmdbId);
    return NextResponse.json({
      title: detail.title,
      originalTitle: detail.originalTitle,
      year: detail.year ?? null,
      rating: detail.rating,
      genres: detail.genres.slice(0, 3),
      overview: detail.overview,
      runtime: detail.runtime ?? null,
      seasons: detail.seasons ?? null,
      backdropPath: detail.backdropPath ?? null,
      logoPath: detail.logoPath ?? null,
    });
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}
