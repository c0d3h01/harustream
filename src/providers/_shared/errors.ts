// ─── Provider Error Helpers ─────────────────────────────────────────────────
// Standardized error throwing with provider + operation context.

import { AppError } from '@/lib/errors';

/**
 * Throws a well-structured AppError tagged with provider and operation names.
 * Call this at the end of catch blocks so the caller gets a useful message.
 *
 * @example
 * try { ... } catch (err) { throwProviderError('FlixHQ', 'metadata', err); }
 */
export function throwProviderError(provider: string, operation: string, error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  throw new AppError('PROVIDER_ERROR', `[${provider}] ${operation}: ${message}`, {
    provider,
    cause: { operation, message },
  });
}
