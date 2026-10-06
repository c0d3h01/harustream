interface CacheEntry<T> {
  value?: T;
  expiresAt: number;
  pending?: Promise<T>;
}

export class TtlCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();

  get(key: string): T | undefined {
    const existing = this.entries.get(key);
    if (existing?.value !== undefined && existing.expiresAt > Date.now()) return existing.value;
    if (existing && !existing.pending) this.entries.delete(key);
    return undefined;
  }

  getOrSet(
    key: string,
    ttlMs: number,
    factory: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    const hit = this.get(key);
    let value = hit !== undefined ? Promise.resolve(hit) : this.entries.get(key)?.pending;
    if (!value) {
      value = factory().then(
        (next) => {
          this.entries.set(key, { value: next, expiresAt: Date.now() + ttlMs });
          return next;
        },
        (error: unknown) => {
          this.entries.delete(key);
          throw error;
        },
      );
      this.entries.set(key, { expiresAt: 0, pending: value });
    }
    if (!signal) return value;
    if (signal.aborted) return Promise.reject(signal.reason);
    // Race the shared promise against the signal without cancelling the
    // shared work; the listener is removed once the value settles.
    return new Promise<T>((resolve, reject) => {
      const onAbort = () => reject(signal.reason);
      signal.addEventListener('abort', onAbort, { once: true });
      value.then(
        (next) => {
          signal.removeEventListener('abort', onAbort);
          resolve(next);
        },
        (error: unknown) => {
          signal.removeEventListener('abort', onAbort);
          reject(error);
        },
      );
    });
  }
}
