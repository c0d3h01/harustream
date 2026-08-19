'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { type Provider, setAvailableProviders } from '@/lib/state/providers';

// Live provider availability. The provider list is fetched from the upstream
// `/api/providers` endpoint at runtime — nothing is hardcoded or read from
// env. Every successful fetch also registers the list in the shared runtime
// registry so sync consumers (display names, playback fallback) see the same
// data. On failure the last known list is kept; only the very first load can
// end up empty.

const REFRESH_INTERVAL_MS = 60_000;

export type ProvidersState = {
  /** Providers the API serves right now (empty until the first fetch lands). */
  providers: Provider[];
  /** True until the first fetch settles. */
  loading: boolean;
  /** True while a background refresh is in flight. */
  refreshing: boolean;
  /** Last fetch failure message, null when the last fetch succeeded. */
  error: string | null;
  /** Epoch ms of the last successful fetch, null before the first. */
  refreshedAt: number | null;
  refresh: () => Promise<void>;
};

export function useProviders(): ProvidersState {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const lastSignatureRef = useRef('');

  const refresh = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const response = await fetch('/api/providers', {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: controller.signal,
      });
      const body = (await response.json()) as { success?: boolean; providers?: Provider[] };
      if (!response.ok || !Array.isArray(body.providers)) {
        throw new Error(`Provider list request failed (${response.status})`);
      }
      const signature = body.providers
        .map((provider) => `${provider.id}:${provider.name}`)
        .join('|');
      if (signature !== lastSignatureRef.current) {
        lastSignatureRef.current = signature;
        setProviders(body.providers);
        setAvailableProviders(body.providers);
      }
      setError(null);
      setRefreshedAt(Date.now());
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  // Initial fetch, then keep the list fresh in the background. A hidden tab
  // is skipped by the focus listener and the interval is cheap anyway.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    (async () => {
      await refresh();
      if (cancelled) return;
      setLoading(false);
      timer = setInterval(() => {
        setRefreshing(true);
        void refresh().finally(() => setRefreshing(false));
      }, REFRESH_INTERVAL_MS);
    })();

    const onFocus = () => {
      setRefreshing(true);
      void refresh().finally(() => setRefreshing(false));
    };
    window.addEventListener('focus', onFocus);

    return () => {
      cancelled = true;
      requestRef.current?.abort();
      if (timer) clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  return {
    providers,
    loading,
    refreshing,
    error,
    refreshedAt,
    refresh,
  };
}
