import { envInt } from '@/lib/env';
import { asAppError, ProviderTimeoutError } from '@/lib/errors';
import { scopeLogger } from '@/lib/log';
import type { ProviderModule } from '@/providers/_shared';

const logger = scopeLogger('providers');

export async function runFanout<T>(
  providers: ProviderModule[],
  operation: (provider: ProviderModule, signal: AbortSignal) => Promise<T>,
  signal?: AbortSignal,
): Promise<Array<{ provider: ProviderModule; value?: T; error?: Error }>> {
  const timeoutMs = envInt('PROVIDER_TIMEOUT_MS', 10_000);
  const callerController = new AbortController();
  const onCallerAbort = () => callerController.abort();
  signal?.addEventListener('abort', onCallerAbort, { once: true });
  if (signal?.aborted) callerController.abort();

  const run = async (provider: ProviderModule): Promise<T> => {
    const controller = new AbortController();
    const startedAt = Date.now();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const onAbort = () => controller.abort();
    callerController.signal.addEventListener('abort', onAbort, { once: true });
    if (callerController.signal.aborted) controller.abort();
    try {
      return await operation(provider, controller.signal);
    } catch (error) {
      const providerTimedOut = timedOut && !signal?.aborted;
      const appError = asAppError(error, { providerTimeout: providerTimedOut });
      const providerError = providerTimedOut
        ? new ProviderTimeoutError(provider.id, timeoutMs)
        : appError;
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
    } finally {
      clearTimeout(timer);
      callerController.signal.removeEventListener('abort', onAbort);
    }
  };

  const settled = await Promise.allSettled(providers.map((provider) => run(provider)));
  signal?.removeEventListener('abort', onCallerAbort);

  return settled.map((result, index) =>
    result.status === 'fulfilled'
      ? { provider: providers[index] as ProviderModule, value: result.value }
      : { provider: providers[index] as ProviderModule, error: asAppError(result.reason) },
  );
}
