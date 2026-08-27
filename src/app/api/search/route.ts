import { NextResponse } from 'next/server';
import { apiErrorResponse, requestIdOf } from '@/lib/api/respond';
import { AppError } from '@/lib/errors';
import { search } from '@/services/search';
import { searchQuery } from '@/validations/api';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const requestId = requestIdOf(request);
  const parsed = searchQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) {
    return apiErrorResponse(new AppError('BAD_REQUEST', 'Invalid search query'), requestId);
  }
  try {
    return NextResponse.json(
      await search(parsed.data.q, parsed.data.provider, parsed.data.page, request.signal),
    );
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}
