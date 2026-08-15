// Shared response/error helpers for all API route handlers. Keeps error
// handling consistent across the app: every handler returns the same JSON
// shape and logs a verbose entry with the request id stamped by the proxy
// middleware.

import { NextResponse } from 'next/server';
import { describeProviderError, ProviderError } from './errors';

// Error payload shape sent to the browser. `requestId` lets the user report
// a failing request and us to find it in the logs.
export function apiErrorResponse(error: unknown, requestId?: string): NextResponse {
  if (error instanceof ProviderError) {
    return NextResponse.json(
      {
        error: describeProviderError(error),
        code: error.code,
        ...(requestId ? { requestId } : {}),
      },
      { status: error.status >= 400 && error.status < 600 ? error.status : 502 },
    );
  }

  return NextResponse.json(
    {
      error: 'Something went wrong while loading content.',
      ...(requestId ? { requestId } : {}),
    },
    { status: 500 },
  );
}

// Reads the `x-request-id` header that the proxy middleware stamps onto every
// /api request (falls back to a fresh id when absent).
export function requestIdOf(request: Request): string {
  return request.headers.get('x-request-id') ?? crypto.randomUUID().slice(0, 12);
}
