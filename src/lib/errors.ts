import { scopeLogger } from './log';

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'PROVIDER_ERROR'
  | 'PROVIDER_TIMEOUT'
  | 'INVALID_RESPONSE'
  | 'UPSTREAM'
  | 'CONFIG';

const errorMeta: Record<ErrorCode, { status: number; message: string }> = {
  BAD_REQUEST: { status: 400, message: 'Invalid request' },
  FORBIDDEN: { status: 403, message: 'Request not allowed' },
  NOT_FOUND: { status: 404, message: 'Resource not found' },
  PROVIDER_ERROR: { status: 502, message: 'Provider unavailable' },
  PROVIDER_TIMEOUT: { status: 504, message: 'Provider request timed out' },
  INVALID_RESPONSE: { status: 502, message: 'Provider returned invalid data' },
  UPSTREAM: { status: 502, message: 'Upstream service unavailable' },
  CONFIG: { status: 500, message: 'Server configuration error' },
};

const errorLogger = scopeLogger('errors');

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly provider?: string;
  readonly cause?: unknown;

  constructor(
    code: ErrorCode,
    message: string,
    options: { provider?: string; cause?: unknown; status?: number } = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = options.status ?? errorMeta[code].status;
    this.provider = options.provider;
    this.cause = options.cause;
  }
}

export class ProviderError extends AppError {
  constructor(message: string, options: { provider?: string; cause?: unknown } = {}) {
    super('PROVIDER_ERROR', message, options);
    this.name = 'ProviderError';
  }
}

export class ProviderTimeoutError extends AppError {
  constructor(provider: string, timeoutMs: number) {
    super('PROVIDER_TIMEOUT', `${provider} timed out after ${timeoutMs}ms`, {
      provider,
    });
    this.name = 'ProviderTimeoutError';
  }
}

export function asAppError(error: unknown, options: { providerTimeout?: boolean } = {}): AppError {
  if (error instanceof AppError) return error;
  if (options.providerTimeout && error instanceof Error && error.name === 'AbortError') {
    return new AppError('PROVIDER_TIMEOUT', error.message, { cause: error });
  }
  return new AppError('UPSTREAM', error instanceof Error ? error.message : String(error), {
    cause: error,
  });
}

export function errorResponseBody(error: unknown, requestId: string) {
  const appError = asAppError(error);
  errorLogger.error(
    {
      err: appError,
      requestId,
      code: appError.code,
      provider: appError.provider,
    },
    'API request failed',
  );
  return {
    error: errorMeta[appError.code].message,
    code: appError.code,
    requestId,
  };
}

export function httpStatusForError(error: unknown): number {
  return asAppError(error).status;
}
