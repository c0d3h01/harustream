import { NextResponse } from 'next/server';
import { apiErrorResponse, requestIdOf } from '@/lib/api/respond';
import { featured } from '@/services/featured';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const requestId = requestIdOf(request);
  try {
    return NextResponse.json(await featured(request.signal));
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}
