import { asAppError, ProviderTimeoutError } from '@/lib/errors';
import type { ProviderModule } from '@/providers/_shared';

const setting = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

export async function runFanout<T>(
  providers: ProviderModule[],
  operation: (provider: ProviderModule, signal: AbortSignal) => Promise<T>,
  signal?: AbortSignal,
): Promise<Array<{ provider: ProviderModule; value?: T; error?: Error }>> {
  const concurrency = setting('PROVIDER_CONCURRENCY', 6);
  const providerTimeoutMs = setting('PROVIDER_TIMEOUT_MS', 10_000);
  const deadlineMs = setting('PROVIDER_DEADLINE_MS', 12_000);
  const results: Array<{ provider: ProviderModule; value?: T; error?: Error }> = providers.map(
    (provider) => ({ provider, error: undefined }),
  );
  const deadline = new AbortController();
  let callerAborted = false;
  let deadlineExpired = false;
  const deadlineTimer = setTimeout(() => {
    deadlineExpired = true;
    deadline.abort();
  }, deadlineMs);
  const abort = () => {
    callerAborted = true;
    deadline.abort();
  };
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < providers.length && !deadline.signal.aborted) {
      const provider = providers[cursor];
      const providerIndex = cursor;
      cursor += 1;
      const controller = new AbortController();
      let providerTimedOut = false;
      const onAbort = () => controller.abort();
      deadline.signal.addEventListener('abort', onAbort, { once: true });
      const timer = setTimeout(() => {
        providerTimedOut = true;
        controller.abort();
      }, providerTimeoutMs);
      try {
        const value = await operation(provider, controller.signal);
        results[providerIndex] = { provider, value };
      } catch (error) {
        const appError = asAppError(error, {
          providerTimeout: providerTimedOut || (deadlineExpired && !callerAborted),
        });
        results[providerIndex] = {
          provider,
          error:
            providerTimedOut || (deadlineExpired && !callerAborted)
              ? new ProviderTimeoutError(provider.id, providerTimeoutMs)
              : appError,
        };
      } finally {
        clearTimeout(timer);
        deadline.signal.removeEventListener('abort', onAbort);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, providers.length) }, () => worker()),
  );
  clearTimeout(deadlineTimer);
  signal?.removeEventListener('abort', abort);
  return results;
}
