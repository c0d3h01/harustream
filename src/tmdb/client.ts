// Server-only TMDB v3 client. The API key lives in `TMDB_API_KEY` and is
// attached as a query param on every request — this module must never be
// imported by client components (all calls run in RSC / route handlers).

import type { z } from 'zod';
import { TtlCache } from '@/lib/cache';
import { AppError } from '@/lib/errors';
import { parseRaw } from '@/validations/provider';

const API_BASE = 'https://api.themoviedb.org/3';

function timeoutMs(): number {
  const raw = Number(process.env.TMDB_TIMEOUT_MS ?? 10_000);
  return Number.isFinite(raw) && raw > 0 ? raw : 10_000;
}

/** Lazily read so builds/prerenders without a key don't crash at import. */
export function tmdbApiKey(): string {
  const key = process.env.TMDB_API_KEY?.trim();
  if (!key) throw new AppError('CONFIG', 'TMDB_API_KEY is not configured');
  return key;
}

const cache = new TtlCache<unknown>();

function cacheKey(path: string, params: Record<string, string>): string {
  const query = Object.keys(params)
    .sort()
    .map((name) => `${name}=${params[name]}`)
    .join('&');
  return `tmdb:${path}?${query}`;
}

export async function tmdbFetch<S extends z.ZodTypeAny>(
  schema: S,
  path: string,
  params: Record<string, string> = {},
  options: { signal?: AbortSignal; ttlMs?: number } = {},
): Promise<z.infer<S>> {
  type Data = z.infer<S>;
  const key = tmdbApiKey();
  const query = new URLSearchParams({ ...params, api_key: key });
  const url = `${API_BASE}${path}?${query.toString()}`;
  const ttlMs = options.ttlMs ?? 600_000;
  return (await cache.getOrSet(cacheKey(path, params), ttlMs, async () => {
    let response: Response;
    try {
      response = await fetch(url, { signal: options.signal ?? AbortSignal.timeout(timeoutMs()) });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new AppError('UPSTREAM', `TMDB request timed out: ${path}`, { cause: error });
      }
      throw new AppError('UPSTREAM', `TMDB request failed: ${path}`, { cause: error });
    }
    if (response.status === 401) {
      throw new AppError('CONFIG', 'TMDB_API_KEY is invalid');
    }
    if (response.status === 404) {
      throw new AppError('NOT_FOUND', `TMDB resource not found: ${path}`);
    }
    if (response.status === 429) {
      throw new AppError('UPSTREAM', 'TMDB rate limit exceeded');
    }
    if (!response.ok) {
      throw new AppError('UPSTREAM', `TMDB request failed (${response.status}): ${path}`);
    }
    const json: unknown = await response.json();
    return parseRaw(schema as z.ZodType<Data>, json, { provider: 'tmdb', op: path });
  })) as Data;
}
