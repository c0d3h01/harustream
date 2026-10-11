import type { StreamVariant } from '@/lib/streaming/types';

export type PlayerStatus =
  | 'idle'
  | 'loading'
  | 'playing'
  | 'paused'
  | 'buffering'
  | 'stalled'
  | 'error';

export type PlayerErrorKind = 'network' | 'decode' | 'expired' | 'unsupported' | 'unknown';

export interface PlayerErrorInfo {
  kind: PlayerErrorKind;
  message: string;
  status?: number;
}

export interface PlayerState {
  status: PlayerStatus;
  error?: PlayerErrorInfo;
}

export type PlayerAction =
  | { type: 'reset' }
  | { type: 'loading' }
  | { type: 'ready' }
  | { type: 'playing' }
  | { type: 'paused' }
  | { type: 'waiting' }
  | { type: 'stalled' }
  | { type: 'error'; error: PlayerErrorInfo };

export function playerReducer(state: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
    case 'reset':
      return { status: 'idle' };
    case 'loading':
      return { status: 'loading' };
    case 'ready':
      return state.status === 'playing' || state.status === 'buffering'
        ? state
        : { status: 'paused' };
    case 'playing':
      return { status: 'playing' };
    case 'paused':
      return { status: 'paused' };
    case 'waiting':
      return { status: 'buffering' };
    case 'stalled':
      return { status: 'stalled' };
    case 'error':
      return state.status === 'error' ? state : { status: 'error', error: action.error };
    default:
      return state;
  }
}

export interface EngineAttachArgs {
  video: HTMLVideoElement;
  variant: StreamVariant;
  onError: (error: PlayerErrorInfo) => void;
  signal: AbortSignal;
}

export type EngineCleanup = () => void;
export type Engine = (args: EngineAttachArgs) => EngineCleanup | Promise<EngineCleanup>;

export function toPlayerError(error: unknown): PlayerErrorInfo {
  if (error instanceof Error) return { kind: 'unknown', message: error.message };
  return { kind: 'unknown', message: 'Playback failed' };
}
