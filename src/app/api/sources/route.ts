import { NextResponse } from 'next/server';
import { apiErrorResponse, requestIdOf } from '@/lib/api/respond';
import { AppError } from '@/lib/errors';
import { mediaPlaybackHref, subtitlePlaybackHref } from '@/lib/media/playbackHref.server';
import { sources } from '@/services/sources';
import { sourcesQuery } from '@/validations/api';

export const dynamic = 'force-dynamic';

// GET /api/sources — resolve playable stream sources for an episode. Every
// playback href (main media + subtitles) is minted here, where the proxy
// secret lives, so clients only handle opaque URLs they cannot forge.
export async function GET(request: Request) {
  const requestId = requestIdOf(request);
  const parsed = sourcesQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) {
    return apiErrorResponse(new AppError('BAD_REQUEST', 'Invalid sources query'), requestId);
  }
  const { provider, ref, kind } = parsed.data;
  try {
    const resolved = await sources(provider, ref, kind, request.signal);
    const context = { providerId: provider, ref, kind };
    const enriched = resolved.map((source) => ({
      ...source,
      playbackHref: mediaPlaybackHref(source, context),
      subtitles: source.subtitles.map((subtitle) => ({
        ...subtitle,
        href: subtitlePlaybackHref(subtitle, source.headers),
      })),
    }));
    return NextResponse.json(enriched);
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}
