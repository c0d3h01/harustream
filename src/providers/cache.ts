// Tiny in-process TTL cache with single-flight loading. Used for the
// manifest and provider module sources; a module-level Map is fine on
// serverless because each instance only lives for the duration of one batch
// of requests anyway.

type Entry<T> = { value: T; expiresAt: number };

const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export function cachedGet<T>(key: string): T | undefined {
  const entry = store.get(key) as Entry<T> | undefined;
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

export function cachedSet<T>(key: string, value: T, ttlMs: number): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

// Single-flight wrapper: concurrent callers for the same key share one
// in-flight fetch instead of stampeding the upstream.
export async function cachedFetch<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
): Promise<T> {
  const hit = cachedGet<T>(key);
  if (hit !== undefined) return hit;
  const flight = inflight.get(key) as Promise<T> | undefined;
  if (flight) return flight;
  const promise = load()
    .then((value) => {
      cachedSet(key, value, ttlMs);
      return value;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, promise);
  return promise;
}
