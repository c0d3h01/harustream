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

const statusByCode: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  PROVIDER_ERROR: 502,
  PROVIDER_TIMEOUT: 504,
  INVALID_RESPONSE: 502,
  UPSTREAM: 502,
  CONFIG: 500,
};

const safeMessageByCode: Record<ErrorCode, string> = {
  BAD_REQUEST: 'Invalid request',
  FORBIDDEN: 'Request not allowed',
  NOT_FOUND: 'Resource not found',
  PROVIDER_ERROR: 'Provider unavailable',
  PROVIDER_TIMEOUT: 'Provider request timed out',
  INVALID_RESPONSE: 'Provider returned invalid data',
  UPSTREAM: 'Upstream service unavailable',
  CONFIG: 'Server configuration error',
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
    this.status = options.status ?? statusByCode[code];
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

export class ProviderUnsupportedError extends AppError {
  constructor(message: string) {
    super('PROVIDER_ERROR', message);
    this.name = 'ProviderUnsupportedError';
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
    error: safeMessageByCode[appError.code],
    code: appError.code,
    requestId,
  };
}

export function httpStatusForError(error: unknown): number {
  return asAppError(error).status;
}
