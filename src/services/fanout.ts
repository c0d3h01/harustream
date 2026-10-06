import { asAppError, ProviderTimeoutError } from '@/lib/errors';
import { scopeLogger } from '@/lib/log';
import type { ProviderModule } from '@/providers/_shared';
import { providerTimeoutMs, timeoutSignal } from './provider';

const logger = scopeLogger('providers');

export async function runFanout<T>(
  providers: ProviderModule[],
  operation: (provider: ProviderModule, signal: AbortSignal) => Promise<T>,
  signal?: AbortSignal,
): Promise<Array<{ provider: ProviderModule; value?: T; error?: Error }>> {
  const timeoutMs = providerTimeoutMs();

  const run = async (provider: ProviderModule): Promise<T> => {
    const timeout = timeoutSignal(signal);
    const startedAt = Date.now();
    try {
      return await operation(provider, timeout);
    } catch (error) {
      const providerTimedOut = timeout.aborted && !signal?.aborted;
      const providerError = providerTimedOut
        ? new ProviderTimeoutError(provider.id, timeoutMs)
        : asAppError(error, { providerTimeout: providerTimedOut });
      logger.warn(
        {
          err: providerError,
          provider: provider.id,
          ms: Date.now() - startedAt,
          timedOut: providerTimedOut,
        },
        'Provider request failed',
      );
      throw providerError;
    }
  };

  const settled = await Promise.allSettled(providers.map((provider) => run(provider)));

  return settled.map((result, index) =>
    result.status === 'fulfilled'
      ? { provider: providers[index] as ProviderModule, value: result.value }
      : { provider: providers[index] as ProviderModule, error: asAppError(result.reason) },
  );
}
