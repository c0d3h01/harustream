interface CacheEntry<T> {
  value?: T;
  expiresAt: number;
  pending?: Promise<T>;
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

  async getOrSet(key: string, ttlMs: number, factory: () => Promise<T>): Promise<T> {
    const existing = this.entries.get(key);
    if (existing?.value !== undefined && existing.expiresAt > Date.now()) {
      return existing.value;
    }
    if (existing?.pending) return existing.pending;

    const pending = factory()
      .then((value) => {
        this.entries.set(key, { value, expiresAt: Date.now() + ttlMs });
        return value;
      })
      .catch((error: unknown) => {
        this.entries.delete(key);
        throw error;
      });
    this.entries.set(key, { expiresAt: 0, pending });
    return pending;
  }

  clear(): void {
    this.entries.clear();
  }
}

export const appCache = new TtlCache<unknown>();
