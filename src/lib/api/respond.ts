import { NextResponse } from 'next/server';
import { AppError, errorResponseBody, httpStatusForError } from '@/lib/errors';

export function requestIdOf(request: Request): string {
  return request.headers.get('x-request-id') || crypto.randomUUID();
}

export function apiErrorResponse(error: unknown, requestId: string) {
  const cause =
    error instanceof AppError
      ? error
      : new AppError('UPSTREAM', error instanceof Error ? error.message : String(error), {
          cause: error,
        });
  return NextResponse.json(errorResponseBody(cause, requestId), {
    status: httpStatusForError(cause),
  });
}
