import { NextResponse } from 'next/server';
import { apiErrorResponse, requestIdOf } from '@/lib/api/respond';
import { AppError } from '@/lib/errors';
import { episodes } from '@/services/episodes';
import { providerRefQuery } from '@/validations/api';

export const dynamic = 'force-dynamic';

// Temporary compatibility shim for the old UI; delete in phase 2.
export async function GET(request: Request) {
  const requestId = requestIdOf(request);
  const params = new URL(request.url).searchParams;
  const parsed = providerRefQuery.safeParse({
    provider: params.get('provider'),
    ref: params.get('ref') ?? params.get('link'),
  });
  if (!parsed.success) {
    return apiErrorResponse(new AppError('BAD_REQUEST', 'Invalid episodes query'), requestId);
  }
  try {
    return NextResponse.json(await episodes(parsed.data.provider, parsed.data.ref, request.signal));
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}
