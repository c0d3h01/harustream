import type { Episode, Media, Meta } from '@/lib/api/client';

export type View = 'home' | 'search' | 'library' | 'settings';

export type Detail = {
  item: Media;
  meta?: Meta;
} | null;

export type Player =
  | { kind: 'idle' }
  | { kind: 'loading'; item: Media; episode: string; episodes: Episode[] }
  | {
      kind: 'playing';
      item: Media;
      episode: string;
      stream: import('@/lib/api/client').Stream;
      episodes: Episode[];
    }
  | { kind: 'error'; message: string; item?: Media; episodes: Episode[] };

export type Notice = { id: number; message: string } | null;

export type State = {
  view: View;
  query: string;
  results: Media[];
  resultsLoading: boolean;
  selected: Detail;
  playing: Player;
  notice: Notice;
};

export type Action =
  | { type: 'view/set'; view: View }
  | { type: 'query/set'; query: string }
  | { type: 'results/loading' }
  | { type: 'results/set'; results: Media[] }
  | { type: 'results/clear' }
  | { type: 'selected/set'; item: Media }
  | { type: 'selected/merge'; meta: Meta }
  | { type: 'selected/close' }
  | { type: 'player/loading'; item: Media; episode: string; episodes: Episode[] }
  | {
      type: 'player/playing';
      item: Media;
      episode: string;
      stream: import('@/lib/api/client').Stream;
      episodes: import('@/lib/api/client').Episode[];
    }
  | { type: 'player/error'; message: string; item?: Media; episodes?: Episode[] }
  | { type: 'player/close' }
  | { type: 'notice/show'; message: string }
  | { type: 'notice/dismiss' };

let noticeCounter = 0;

export const initialState: State = {
  view: 'home',
  query: '',
  results: [],
  resultsLoading: false,
  selected: null,
  playing: { kind: 'idle' },
  notice: null,
};

function playerEpisodes(state: State): Episode[] {
  if (state.playing.kind === 'playing' || state.playing.kind === 'loading') {
    return state.playing.episodes;
  }
  if (state.playing.kind === 'error') return state.playing.episodes;
  return [];
}

function playerItem(state: State): Media | undefined {
  if (state.playing.kind === 'playing' || state.playing.kind === 'loading') {
    return state.playing.item;
  }
  if (state.playing.kind === 'error') return state.playing.item;
  return undefined;
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'view/set':
      return { ...state, view: action.view };
    case 'query/set':
      return { ...state, query: action.query };
    case 'results/loading':
      return { ...state, resultsLoading: true };
    case 'results/set':
      return { ...state, results: action.results, resultsLoading: false };
    case 'results/clear':
      return { ...state, results: [], resultsLoading: false };
    case 'selected/set':
      return { ...state, selected: { item: action.item } };
    case 'selected/merge':
      if (!state.selected) return state;
      return { ...state, selected: { ...state.selected, meta: action.meta } };
    case 'selected/close':
      return { ...state, selected: null };
    case 'player/loading':
      return {
        ...state,
        selected: null,
        playing: {
          kind: 'loading',
          item: action.item,
          episode: action.episode,
          episodes: action.episodes,
        },
      };
    case 'player/playing':
      return {
        ...state,
        playing: {
          kind: 'playing',
          item: action.item,
          episode: action.episode,
          stream: action.stream,
          episodes: action.episodes,
        },
      };
    case 'player/error':
      return {
        ...state,
        playing: {
          kind: 'error',
          message: action.message,
          item: action.item ?? playerItem(state),
          episodes: action.episodes ?? playerEpisodes(state),
        },
      };
    case 'player/close':
      return { ...state, playing: { kind: 'idle' } };
    case 'notice/show':
      return {
        ...state,
        notice: { id: ++noticeCounter, message: action.message },
      };
    case 'notice/dismiss':
      return { ...state, notice: null };
    default:
      return state;
  }
}
