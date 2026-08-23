export type PlaybackFailure = 'stall' | 'fatal-error' | 'never-started';

export class FailureDetector {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private started = false;

  constructor(
    private readonly timeoutMs: number,
    private readonly onFailure: (failure: PlaybackFailure) => void,
  ) {}

  start(): void {
    this.started = false;
    this.arm('never-started');
  }

  markStarted(): void {
    this.started = true;
    this.arm('stall');
  }

  markProgress(): void {
    if (this.started) this.arm('stall');
  }

  fatalError(): void {
    this.stop();
    this.onFailure('fatal-error');
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private arm(failure: PlaybackFailure): void {
    this.stop();
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.onFailure(failure);
    }, this.timeoutMs);
  }
}
