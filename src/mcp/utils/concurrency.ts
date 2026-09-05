// Run async work over a list with bounded concurrency.
// Uses `p-limit` if it's already on disk (it's a transitive dep of next / fast-glob),
// otherwise falls back to a tiny in-process worker pool. We never add a hard dep on it.

type PLimit = <T>(fn: () => Promise<T>) => Promise<T>;
type PLimitFactory = (n: number) => PLimit;

let cache: PLimitFactory | null | undefined;

async function getPLimit(): Promise<PLimitFactory | null> {
  if (cache !== undefined) return cache;
  try {
    const mod = await import('p-limit');
    const fn = (mod.default ??
      (mod as unknown as { default: unknown })) as unknown as PLimitFactory;
    cache = typeof fn === 'function' ? fn : null;
    return cache;
  } catch {
    cache = null;
    return null;
  }
}

export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const concurrency = Math.min(Math.max(1, limit), items.length);
  const factory = await getPLimit();
  if (factory) {
    const run = factory(concurrency);
    return Promise.all(items.map((item, i) => run(() => fn(item, i))));
  }
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}
