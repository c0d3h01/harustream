import type { StreamSource } from '@/types';

const FAILED_SOURCE_TTL_MS = 5 * 60_000;
const failedSources = new Map<string, number>();

function isSourceFailed(sourceId: string, now = Date.now()): boolean {
  const expiry = failedSources.get(sourceId);
  if (!expiry) return false;
  if (expiry <= now) {
    failedSources.delete(sourceId);
    return false;
  }
  return true;
}

/** Reset the failure cache (test isolation). */
export function clearFailedSources(): void {
  failedSources.clear();
}

/** Ordered source fallback: skips failed sources, marks failures with a TTL. */
export class SourceQueue {
  readonly #sources: StreamSource[];
  #cursor = -1;
  #current: StreamSource | undefined;

  constructor(sources: StreamSource[]) {
    this.#sources = [...sources];
  }

  /** All sources in their original order (for the server picker UI). */
  get sources(): readonly StreamSource[] {
    return this.#sources;
  }

  nextSource(): StreamSource | undefined {
    while (++this.#cursor < this.#sources.length) {
      const source = this.#sources[this.#cursor];
      if (!isSourceFailed(source.id)) {
        this.#current = source;
        return source;
      }
    }
    this.#current = undefined;
    return undefined;
  }

  failCurrent(): StreamSource | undefined {
    if (this.#current) failedSources.set(this.#current.id, Date.now() + FAILED_SOURCE_TTL_MS);
    return this.nextSource();
  }

  select(sourceId: string): StreamSource | undefined {
    const index = this.#sources.findIndex((source) => source.id === sourceId);
    if (index < 0 || isSourceFailed(sourceId)) return undefined;
    this.#cursor = index;
    this.#current = this.#sources[index];
    return this.#current;
  }
}
