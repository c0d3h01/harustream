import { NextResponse } from 'next/server';
import { apiErrorResponse, requestIdOf } from '@/lib/api/respond';
import { AppError } from '@/lib/errors';
import { catalog } from '@/services/catalog';
import { catalogQuery } from '@/validations/api';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const requestId = requestIdOf(request);
  const parsed = catalogQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) {
    return apiErrorResponse(new AppError('BAD_REQUEST', 'Invalid catalog query'), requestId);
  }
  try {
    return NextResponse.json(
      await catalog(parsed.data.provider, parsed.data.filter, parsed.data.page, request.signal),
    );
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}
