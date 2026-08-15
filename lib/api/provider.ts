import type { ZodTypeAny, z } from 'zod';
import {
  DEFAULT_PROVIDER,
  PROVIDER_BASES,
  PROVIDER_MAX_ATTEMPTS,
  PROVIDER_TIMEOUT_MS,
} from './config';
import { ProviderError } from './errors';
import { isValidProvider } from './providers';

// Server-side fetcher for the upstream provider. All Next route handlers call
// through this — never hit PROVIDER_BASE directly.
//
// Resilience guarantees:
//  - per-request timeout (PROVIDER_TIMEOUT_MS)
//  - retries with small backoff for transient failures (network, 5xx, 429)
//  - automatic failover across PROVIDER_BASES when the primary is down
//  - per-base health tracking with a cooldown so a dead deployment is skipped
//  - verbose structured logging of every attempt
//
// The upstream wraps every payload in { success, data, error? }. We unwrap
// `data` and validate it with the supplied Zod schema.

type Envelope<T> = { success: boolean; data: T; error?: string };
function isEnvelope(value: unknown): value is Envelope<unknown> {
  return typeof value === 'object' && value !== null && 'success' in value && 'data' in value;
}

// Circuit breaker state. Keyed by base URL.
type BaseHealth = { deadUntil: number; consecutiveFailures: number; lastError: ProviderError };
const healthByBase = new Map<string, BaseHealth>();

const COOLDOWN_MS = 30_000;

function markFailure(base: string, error: ProviderError) {
  const entry = healthByBase.get(base) ?? {
    deadUntil: 0,
    consecutiveFailures: 0,
    lastError: error,
  };
  entry.consecutiveFailures += 1;
  entry.deadUntil = Date.now() + COOLDOWN_MS;
  entry.lastError = error;
  healthByBase.set(base, entry);
}

function markSuccess(base: string) {
  healthByBase.delete(base);
}

function cooldownError(base: string): ProviderError | undefined {
  return healthByBase.get(base)?.lastError;
}

function isCoolingDown(base: string): boolean {
  const entry = healthByBase.get(base);
  return !!entry && entry.deadUntil > Date.now();
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function providerFetch<T extends ZodTypeAny>(
  path: string,
  schema: T,
  params: Record<string, string | number | undefined> = {},
  provider: string = DEFAULT_PROVIDER,
  revalidate?: number,
): Promise<z.infer<T>> {
  const resolvedProvider = isValidProvider(provider) ? provider : DEFAULT_PROVIDER;

  const query = new URLSearchParams();
  query.set('provider', resolvedProvider);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    query.set(key, String(value));
  }

  if (PROVIDER_BASES.length === 0) {
    throw new ProviderError(
      500,
      'Provider API not configured (set NEXT_PUBLIC_PROVIDER_API_URL)',
      undefined,
      'UNCONFIGURED',
    );
  }

  const log = (await import('@/lib/log')).scopeLogger('provider');
  let lastError: ProviderError | null = null;
  const started = Date.now();

  for (let attempt = 1; attempt <= PROVIDER_MAX_ATTEMPTS; attempt++) {
    // Round-robin the available bases, skipping any currently cooling down.
    for (const base of PROVIDER_BASES) {
      if (isCoolingDown(base)) {
        const cooldown = cooldownError(base);
        if (cooldown && !lastError) lastError = cooldown;
        log.debug({ base, path, attempt }, 'provider base in cooldown, skipping');
        continue;
      }
      const url = `${base}${path}?${query.toString()}`;
      try {
        const result = await attemptFetch(url, path, revalidate, log, base, attempt, schema);
        markSuccess(base);
        log.info(
          {
            base,
            path,
            provider: resolvedProvider,
            attempt,
            durationMs: Date.now() - started,
          },
          'provider request succeeded',
        );
        return result;
      } catch (error) {
        lastError =
          error instanceof ProviderError
            ? error
            : new ProviderError(502, 'Provider request failed', url, 'BAD_GATEWAY');
        // Only transient failures (429, 5xx, network/timeout) may trip the
        // circuit breaker. A 4xx is a deterministic client error — e.g. an
        // unsupported provider id — and must not take the whole base down for
        // every other provider on this origin.
        const transient = lastError.status === 429 || lastError.status >= 500;
        if (transient) markFailure(base, lastError);
        log.warn(
          {
            base,
            path,
            provider: resolvedProvider,
            attempt,
            status: lastError.status,
            code: lastError.code,
            durationMs: Date.now() - started,
            retrying: transient && attempt < PROVIDER_MAX_ATTEMPTS,
          },
          'provider request failed',
        );
        // Backoff before retrying the next base / attempt.
        if (transient) await sleep(Math.min(250 * attempt, 1000));
      }
    }
  }

  throw lastError ?? new ProviderError(502, 'Provider unreachable', undefined, 'UNREACHABLE');
}

async function attemptFetch<T extends ZodTypeAny>(
  url: string,
  path: string,
  revalidate: number | undefined,
  log: ReturnType<typeof import('@/lib/log').scopeLogger>,
  base: string,
  attempt: number,
  schema: T,
): Promise<z.infer<T>> {
  // AbortSignal.timeout guarantees we never hang on a dead upstream.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
      ...(typeof revalidate === 'number' && revalidate > 0
        ? { next: { revalidate } }
        : { cache: 'no-store' }),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError';
    throw new ProviderError(
      timedOut ? 504 : 502,
      timedOut
        ? `Provider timed out after ${PROVIDER_TIMEOUT_MS}ms`
        : `Provider unreachable: ${base}`,
      url,
      timedOut ? 'TIMEOUT' : 'UNREACHABLE',
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new ProviderError(response.status, `Provider request failed (${response.status})`, url);
  }

  const json = (await response.json()) as unknown;
  const payload = isEnvelope(json) ? json.data : json;
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    log.error(
      {
        base,
        path,
        attempt,
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      },
      'provider response failed schema validation',
    );
    throw new ProviderError(502, 'Provider returned an unexpected shape', url, 'INVALID_SHAPE');
  }
  return parsed.data;
}
