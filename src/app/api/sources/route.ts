import { NextResponse } from 'next/server';
import { apiErrorResponse, requestIdOf } from '@/lib/api/respond';
import { AppError } from '@/lib/errors';
import { sources } from '@/services/sources';
import { sourcesQuery } from '@/validations/api';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const requestId = requestIdOf(request);
  const parsed = sourcesQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) {
    return apiErrorResponse(new AppError('BAD_REQUEST', 'Invalid sources query'), requestId);
  }
  try {
    return NextResponse.json(
      await sources(parsed.data.provider, parsed.data.ref, parsed.data.kind, request.signal),
    );
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}
