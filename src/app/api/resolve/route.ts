import { NextResponse } from 'next/server';
import { apiErrorResponse, requestIdOf } from '@/lib/api/respond';
import { AppError } from '@/lib/errors';
import { resolveTitle } from '@/services/resolve';
import { resolveQuery } from '@/validations/api';

export const dynamic = 'force-dynamic';

/** TMDB title → provider stream match. Thin wrapper over resolveTitle so the
 *  client never fans out provider searches itself. */
export async function GET(request: Request) {
  const requestId = requestIdOf(request);
  const parsed = resolveQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) {
    return apiErrorResponse(new AppError('BAD_REQUEST', 'Invalid resolve query'), requestId);
  }
  try {
    const { kind, tmdbId, title, originalTitle, year } = parsed.data;
    return NextResponse.json(
      await resolveTitle({ kind, tmdbId, title, originalTitle, year }, request.signal),
    );
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}
