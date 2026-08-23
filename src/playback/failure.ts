export type PlaybackFailure = 'stall' | 'fatal-error' | 'never-started';

export class FailureDetector {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private started = false;
  private expectedToPlay = false;
  private seeking = false;

  constructor(
    private readonly timeoutMs: number,
    private readonly onFailure: (failure: PlaybackFailure) => void,
  ) {}

  start(): void {
    this.started = false;
    this.expectedToPlay = false;
    this.seeking = false;
    this.stop();
  }

  markStarted(): void {
    this.started = true;
    if (this.expectedToPlay && !this.seeking) this.arm('stall');
  }

  markProgress(): void {
    if (this.started && this.expectedToPlay && !this.seeking) this.arm('stall');
  }

  setPlaying(playing: boolean): void {
    this.expectedToPlay = playing;
    if (!playing) {
      this.stop();
    } else if (this.started && !this.seeking) {
      this.arm('stall');
    } else if (!this.started && !this.seeking) {
      this.arm('never-started');
    }
  }

  setSeeking(seeking: boolean): void {
    this.seeking = seeking;
    if (seeking) {
      this.stop();
    } else if (this.expectedToPlay) {
      this.arm(this.started ? 'stall' : 'never-started');
    }
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
