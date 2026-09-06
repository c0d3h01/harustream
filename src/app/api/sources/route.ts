import { NextResponse } from 'next/server';
import { apiErrorResponse, requestIdOf } from '@/lib/api/respond';
import { AppError } from '@/lib/errors';
import { sources } from '@/services/sources';
import { sourcesQuery } from '@/validations/api';

export const dynamic = 'force-dynamic';

// GET /api/sources — resolve playable stream variants for an episode. Every
// playback href (main media + subtitles) is already minted by the time
// `sources()` returns — see services/sources.ts — so this route is a thin
// validate-and-forward layer, not where any signing happens.
export async function GET(request: Request) {
  const requestId = requestIdOf(request);
  const parsed = sourcesQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) {
    return apiErrorResponse(new AppError('BAD_REQUEST', 'Invalid sources query'), requestId);
  }
  const { provider, ref, kind } = parsed.data;
  try {
    const variants = await sources(provider, ref, kind, request.signal);
    return NextResponse.json(variants);
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}
