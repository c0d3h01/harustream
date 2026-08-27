import { ProviderError } from '@/lib/errors';

interface ProviderErrorLike {
  response?: {
    status?: unknown;
    statusText?: unknown;
    config?: { url?: unknown };
  };
  config?: { url?: unknown };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function throwProviderError(provider: string, operation: string, error: unknown): never {
  const detailsError =
    error && typeof error === 'object' ? (error as ProviderErrorLike) : undefined;
  const response = detailsError?.response;
  const status = typeof response?.status === 'number' ? response.status : undefined;
  const statusText = typeof response?.statusText === 'string' ? response.statusText : undefined;
  const responseUrl = typeof response?.config?.url === 'string' ? response.config.url : undefined;
  const errorUrl =
    typeof detailsError?.config?.url === 'string' ? detailsError.config.url : undefined;
  const url = responseUrl || errorUrl;
  const details = [
    status ? `HTTP ${status}${statusText ? ` ${statusText}` : ''}` : '',
    url ? `URL ${url}` : '',
    getErrorMessage(error),
  ].filter(Boolean);

  throw new ProviderError(`${provider} ${operation} failed: ${details.join(' | ')}`, {
    provider,
    cause: error,
  });
}
