import type { StreamSource } from '@/types';

const FAILED_SOURCE_TTL_MS = 5 * 60_000;
const failedSources = new Map<string, number>();

export function clearFailedSources(): void {
  failedSources.clear();
}

export function markSourceFailed(sourceId: string, now = Date.now()): void {
  failedSources.set(sourceId, now + FAILED_SOURCE_TTL_MS);
}

export function isSourceFailed(sourceId: string, now = Date.now()): boolean {
  const expiry = failedSources.get(sourceId);
  if (!expiry) return false;
  if (expiry <= now) {
    failedSources.delete(sourceId);
    return false;
  }
  return true;
}

export type SourceQueueState = 'ready' | 'exhausted';

export class SourceQueue {
  private readonly sources: StreamSource[];
  private cursor = -1;
  private current: StreamSource | undefined;
  private exhausted = false;

  constructor(sources: StreamSource[]) {
    this.sources = [...sources];
  }

  nextSource(): StreamSource | undefined {
    while (++this.cursor < this.sources.length) {
      const source = this.sources[this.cursor];
      if (!isSourceFailed(source.id)) {
        this.current = source;
        return source;
      }
    }
    this.current = undefined;
    this.exhausted = true;
    return undefined;
  }

  failCurrent(): StreamSource | undefined {
    if (this.current) markSourceFailed(this.current.id);
    return this.nextSource();
  }

  select(sourceId: string): StreamSource | undefined {
    const index = this.sources.findIndex((source) => source.id === sourceId);
    if (index < 0 || isSourceFailed(sourceId)) return undefined;
    this.cursor = index;
    this.exhausted = false;
    this.current = this.sources[index];
    return this.current;
  }

  get currentSource(): StreamSource | undefined {
    return this.current;
  }

  get state(): SourceQueueState {
    return this.exhausted ? 'exhausted' : 'ready';
  }
}
