import type { Episode, SearchResult, StreamVariant } from '@/types';

export class ApiError extends Error {
  readonly code?: string;
  readonly requestId?: string;
  readonly status: number;

  constructor(status: number, message: string, code?: string, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal,
  });
  const requestId = response.headers.get('x-request-id') ?? undefined;
  const body = (await response.json().catch(() => null)) as
    | { error?: string; code?: string; requestId?: string }
    | T
    | null;
  if (!response.ok) {
    const error = body as { error?: string; code?: string; requestId?: string } | null;
    throw new ApiError(
      response.status,
      error?.error ?? `Request failed (${response.status})`,
      error?.code,
      error?.requestId ?? requestId,
    );
  }
  return body as T;
}

function params(values: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

export function search(
  query: string,
  provider?: string,
  page = 1,
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  return request<SearchResult[]>(`/api/search${params({ q: query, provider, page })}`, signal);
}

export function episodes(provider: string, ref: string, signal?: AbortSignal): Promise<Episode[]> {
  return request<Episode[]>(`/api/episodes${params({ provider, ref })}`, signal);
}

export function sources(
  provider: string,
  ref: string,
  kind: string,
  signal?: AbortSignal,
): Promise<StreamVariant[]> {
  return request<StreamVariant[]>(`/api/sources${params({ provider, ref, kind })}`, signal);
}

export { request };
