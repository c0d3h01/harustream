interface CacheEntry<T> {
  value?: T;
  expiresAt: number;
  pending?: Promise<T>;
}

function withAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted)
    return Promise.reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    void promise.then(
      (value) => {
        signal.removeEventListener('abort', abort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', abort);
        reject(error);
      },
    );
  });
}

export class TtlCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();

  get(key: string): T | undefined {
    const existing = this.entries.get(key);
    if (existing?.value !== undefined && existing.expiresAt > Date.now()) {
      return existing.value;
    }
    if (existing && !existing.pending) this.entries.delete(key);
    return undefined;
  }

  set(key: string, value: T, ttlMs: number): void {
    this.entries.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  getOrSet(
    key: string,
    ttlMs: number,
    factory: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    const existing = this.entries.get(key);
    const value =
      existing?.value !== undefined && existing.expiresAt > Date.now()
        ? Promise.resolve(existing.value)
        : (existing?.pending ??
          factory()
            .then((next) => {
              this.entries.set(key, { value: next, expiresAt: Date.now() + ttlMs });
              return next;
            })
            .catch((error: unknown) => {
              this.entries.delete(key);
              throw error;
            }));

    if (!existing?.pending && !(existing?.value !== undefined && existing.expiresAt > Date.now())) {
      this.entries.set(key, { expiresAt: 0, pending: value });
    }
    return signal ? withAbort(value, signal) : value;
  }

  clear(): void {
    this.entries.clear();
  }
}
