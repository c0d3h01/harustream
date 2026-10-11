'use client';

import { useCallback, useState } from 'react';
import type { ScoredCandidate } from '@/services/resolve';
import type { TmdbKind } from '@/tmdb/catalog';
import { resolveTitleAction } from './resolve-action';

export interface ResolveBody {
  best: ScoredCandidate | null;
  candidates: ScoredCandidate[];
}

export type ResolveState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; body: ResolveBody }
  | { status: 'error' };

const resolveCache = new Map<string, Promise<ResolveBody>>();

function resolveKey(kind: TmdbKind, tmdbId: number): string {
  return `${kind}:${tmdbId}`;
}

function fetchResolve(
  kind: TmdbKind,
  tmdbId: number,
  title: string,
  originalTitle?: string,
  year?: string,
): Promise<ResolveBody> {
  const key = resolveKey(kind, tmdbId);
  const cached = resolveCache.get(key);
  if (cached) return cached;
  const promise = resolveTitleAction(title, originalTitle, year)
    .then((body) => body as ResolveBody)
    .catch((error: unknown) => {
      resolveCache.delete(key);
      throw error;
    });
  resolveCache.set(key, promise);
  return promise;
}

export function useResolveCandidates(
  kind: TmdbKind,
  tmdbId: number,
  title: string,
  originalTitle?: string,
  year?: string,
) {
  const [state, setState] = useState<ResolveState>({ status: 'idle' });

  const identity = resolveKey(kind, tmdbId);
  const [lastIdentity, setLastIdentity] = useState(identity);
  if (lastIdentity !== identity) {
    setLastIdentity(identity);
    setState({ status: 'idle' });
  }

  const load = useCallback(() => {
    if (state.status === 'loading' || state.status === 'ready') return;
    setState({ status: 'loading' });
    fetchResolve(kind, tmdbId, title, originalTitle, year)
      .then((body) => setState({ status: 'ready', body }))
      .catch(() => setState({ status: 'error' }));
  }, [kind, tmdbId, title, originalTitle, year, state.status]);

  return { state, load };
}
