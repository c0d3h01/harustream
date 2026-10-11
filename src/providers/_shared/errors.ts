import { AppError } from '@/lib/errors';

export function throwProviderError(provider: string, operation: string, error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  throw new AppError('PROVIDER_ERROR', `[${provider}] ${operation}: ${message}`, {
    provider,
    cause: { operation, message },
  });
}
