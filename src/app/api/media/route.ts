import { NextResponse } from 'next/server';
import { apiErrorResponse, requestIdOf } from '@/lib/api/respond';
import { AppError } from '@/lib/errors';
import { media } from '@/services/media';
import { providerRefQuery } from '@/validations/api';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const requestId = requestIdOf(request);
  const params = new URL(request.url).searchParams;
  const parsed = providerRefQuery.safeParse({
    provider: params.get('provider'),
    ref: params.get('ref') ?? params.get('link'),
  });
  if (!parsed.success) {
    return apiErrorResponse(new AppError('BAD_REQUEST', 'Invalid media query'), requestId);
  }
  try {
    return NextResponse.json(await media(parsed.data.provider, parsed.data.ref, request.signal));
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}
