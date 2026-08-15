// Error taxonomy for the provider proxy layer. Every failure that bubbles up
// from a provider call is a ProviderError carrying a stable `code`, the HTTP
// `status` we should surface downstream, and the upstream URL that failed.

export type ProviderErrorCode =
  | 'UNCONFIGURED'
  | 'NETWORK'
  | 'TIMEOUT'
  | 'BAD_GATEWAY'
  | 'RATE_LIMITED'
  | 'UNAVAILABLE'
  | 'UPSTREAM_ERROR'
  | 'INVALID_SHAPE'
  | 'UNREACHABLE'
  | 'NO_SOURCE';

export class ProviderError extends Error {
  readonly status: number;
  readonly upstream?: string;
  readonly code: ProviderErrorCode;

  constructor(status: number, message: string, upstream?: string, code?: ProviderErrorCode) {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
    this.upstream = upstream;
    // Derive a stable code when the caller didn't pin one.
    this.code =
      code ??
      (status === 408 || status === 504
        ? 'TIMEOUT'
        : status === 429
          ? 'RATE_LIMITED'
          : status === 503
            ? 'UNAVAILABLE'
            : status >= 500
              ? 'UPSTREAM_ERROR'
              : 'BAD_GATEWAY');
  }
}

// Human-readable, user-safe summary for a given error. Used to render the
// same message in the UI and the server error responses.
export function describeProviderError(error: unknown): string {
  if (error instanceof ProviderError) {
    switch (error.code) {
      case 'UNCONFIGURED':
        return 'Streaming sources are not configured yet.';
      case 'TIMEOUT':
        return 'The streaming source took too long to respond.';
      case 'RATE_LIMITED':
        return 'The streaming source is rate-limiting requests. Try again shortly.';
      case 'UNAVAILABLE':
        return 'The streaming source is temporarily unavailable.';
      case 'INVALID_SHAPE':
        return 'The streaming source returned an unexpected response.';
      case 'NO_SOURCE':
        return 'The streaming source did not return a playable stream for this title.';
      case 'UNREACHABLE':
      case 'NETWORK':
        return 'The streaming source could not be reached.';
      case 'UPSTREAM_ERROR':
      case 'BAD_GATEWAY':
        return 'The streaming source hit an error.';
    }
  }
  return 'Something went wrong while loading content.';
}
