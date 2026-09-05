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

/** Ordered source fallback: skips failed sources, marks failures with a TTL.
 * Failure memory is scoped per episode (`scope`, e.g. `provider:ref`) so the
 * same source id in a different episode isn't incorrectly skipped. */
export class SourceQueue {
  readonly #sources: StreamSource[];
  readonly #scope: string;
  #cursor = -1;
  #current: StreamSource | undefined;

  constructor(sources: StreamSource[], scope = '') {
    this.#sources = [...sources];
    this.#scope = scope;
  }

  /** All sources in their original order (for the server picker UI). */
  get sources(): readonly StreamSource[] {
    return this.#sources;
  }

  #key(sourceId: string): string {
    return this.#scope ? `${this.#scope}:${sourceId}` : sourceId;
  }

  nextSource(): StreamSource | undefined {
    while (++this.#cursor < this.#sources.length) {
      const source = this.#sources[this.#cursor];
      if (!isSourceFailed(this.#key(source.id))) {
        this.#current = source;
        return source;
      }
    }
    this.#current = undefined;
    return undefined;
  }

  failCurrent(): StreamSource | undefined {
    if (this.#current)
      failedSources.set(this.#key(this.#current.id), Date.now() + FAILED_SOURCE_TTL_MS);
    return this.nextSource();
  }

  select(sourceId: string): StreamSource | undefined {
    const index = this.#sources.findIndex((source) => source.id === sourceId);
    if (index < 0 || isSourceFailed(this.#key(sourceId))) return undefined;
    this.#cursor = index;
    this.#current = this.#sources[index];
    return this.#current;
  }
}
