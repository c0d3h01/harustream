import { z } from 'zod';
import { TtlCache } from '@/lib/cache';
import { envInt } from '@/lib/env';
import { AppError } from '@/lib/errors';

const API_BASE = 'https://api.themoviedb.org/3';

function tmdbApiKey(): string {
  const key = process.env.TMDB_API_KEY?.trim();
  if (!key) throw new AppError('CONFIG', 'TMDB_API_KEY is not configured');
  return key;
}

const cache = new TtlCache<unknown>();

const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);

/**
 * TMDB resets connections when several requests land at once from one IP
 * (reproducible: 3 of 8 parallel calls fail with ECONNRESET) and an immediate
 * retry lands on the same dead keep-alive socket. Three attempts with growing
 * delays recover it. ponytail: raise ATTEMPTS only if the config notice still
 * shows up in normal use.
 */
const ATTEMPTS = 3;
const RETRY_DELAYS_MS = [400, 1200];

const retryDelay = (attempt: number) =>
  new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt] ?? 1200));

async function requestTmdb(url: string, path: string): Promise<unknown> {
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(url, {
        signal: AbortSignal.timeout(envInt('TMDB_TIMEOUT_MS', 10_000)),
      });
    } catch (error) {
      if (attempt < ATTEMPTS - 1) {
        await retryDelay(attempt);
        continue;
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new AppError('UPSTREAM', `TMDB request timed out: ${path}`, { cause: error });
      }
      throw new AppError('UPSTREAM', `TMDB request failed: ${path}`, { cause: error });
    }
    if (RETRYABLE.has(response.status) && attempt < ATTEMPTS - 1) {
      await retryDelay(attempt);
      continue;
    }
    if (!response.ok) {
      const code =
        response.status === 401 ? 'CONFIG' : response.status === 404 ? 'NOT_FOUND' : 'UPSTREAM';
      const msg =
        response.status === 401
          ? 'TMDB_API_KEY is invalid'
          : response.status === 404
            ? 'TMDB resource not found'
            : response.status === 429
              ? 'TMDB rate limit exceeded'
              : `TMDB request failed (${response.status})`;
      throw new AppError(code, msg);
    }
    return response.json();
  }
  throw new AppError('UPSTREAM', `TMDB request failed: ${path}`);
}

export async function tmdbFetch<S extends z.ZodTypeAny>(
  schema: S,
  path: string,
  params: Record<string, string> = {},
  options: { signal?: AbortSignal; ttlMs?: number } = {},
): Promise<z.infer<S>> {
  const key = tmdbApiKey();
  const query = new URLSearchParams({ ...params, api_key: key });
  const url = `${API_BASE}${path}?${query.toString()}`;
  const ttlMs = options.ttlMs ?? 600_000;
  const cacheKeyParams = new URLSearchParams(params);
  cacheKeyParams.sort();
  const cacheKey = `tmdb:${path}?${cacheKeyParams.toString()}`;
  return (await cache.getOrSet(
    cacheKey,
    ttlMs,
    async () => {
      try {
        return schema.parse(await requestTmdb(url, path)) as z.infer<S>;
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new AppError(
            'INVALID_RESPONSE',
            `${path} returned invalid response: ${error.message}`,
          );
        }
        throw error;
      }
    },
    options.signal,
  )) as z.infer<S>;
}
