'use client';

import { Loader2 } from 'lucide-react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import dynamic from 'next/dynamic';
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { DURATIONS, EASE, VIEWPORT, viewFadeUp } from '@/components/motion';
import {
  type FeaturedFeed,
  getFeatured,
  getMeta,
  getStream,
  getStreamFallback,
  type Media,
  type Meta,
  pickBestHubUrl,
  providerById,
  rememberStreamFailure,
  resolveMovieStream,
  resolveSeriesEpisodes,
  safeErrorMessage,
  searchCatalog,
} from '@/lib/api/client';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { useLibrary } from '@/lib/hooks/useLibrary';
import { useProviders } from '@/lib/hooks/useProviders';
import { useSearchHistory } from '@/lib/hooks/useSearchHistory';
import { useSettings } from '@/lib/hooks/useSettings';
import { initialState, reducer, type View } from '@/lib/state/reducer';
import { ContinueWatching } from '../features/home/ContinueWatching';
import { Hero } from '../features/home/Hero';
import { HeroSkeleton } from '../features/home/HeroSkeleton';
import { Rail } from '../features/home/Rail';
import { Library } from '../features/library/Library';
import { Results } from '../features/search/Results';
import { SettingsView } from '../features/settings/SettingsView';
import { FloatingMenu } from './FloatingMenu';
import { Notice } from './Notice';

// The player bundles hls.js (~500KB), which would bloat the first paint if
// loaded eagerly. Both overlays only mount on user interaction, so they're
// code-split and fetched on demand. The player gets a loading fallback so
// tapping "Play" shows immediate feedback while its chunk loads.
const DetailModal = dynamic(() =>
  import('../features/player/DetailModal').then((m) => m.DetailModal),
);
const PlayerModal = dynamic(
  () => import('../features/player/PlayerModal').then((m) => m.PlayerModal),
  {
    loading: PlayerLoader,
  },
);

function PlayerLoader() {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background">
      <Loader2 className="size-10 animate-spin text-primary" aria-hidden="true" />
      <span className="sr-only">Loading player…</span>
    </div>
  );
}

// Preload the code-split player chunk before the user commits to watching —
// hovering the hero's Play button (or the detail modal's Watch now) fetches
// the ~500KB hls.js bundle while they decide, so play starts instantly.
// Repeated calls are a no-op once the chunk is loaded.
const preloadPlayer = () => {
  void import('../features/player/PlayerModal');
};

const EMPTY_FEED: FeaturedFeed = {
  featured: [],
  newest: [],
  movies: [],
  series: [],
};

export function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { settings, update, toggleExcludedQuality } = useSettings();
  const providers = useProviders();
  const library = useLibrary(settings.provider);
  const history = useSearchHistory(settings.provider);
  const [feed, setFeed] = useState<FeaturedFeed | null>(null);

  // Apply the active theme to <html>. The layout's inline script already
  // restored the persisted theme pre-hydration, so this only reacts to
  // changes made inside the settings view.
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  // The persisted provider may no longer be served by the API (the picker
  // reflects the live list, not a hardcoded registry). Once the live list is
  // known, correct it: keep it when it's still served (ids match
  // case-insensitively — the persisted 'movieBoxWeb' is the manifest key
  // "MovieBox Web"), otherwise fall back to MovieBox Web when present, else
  // the first available provider, instead of leaving every request to 400
  // upstream.
  useEffect(() => {
    if (providers.loading) return;
    if (providers.providers.length === 0) return;
    if (providers.providers.some((p) => p.id.toLowerCase() === settings.provider.toLowerCase())) {
      return;
    }
    const preferred =
      providers.providers.find((p) => p.id.toLowerCase() === 'movieboxweb') ??
      providers.providers[0];
    update({ provider: preferred.id });
  }, [providers.loading, providers.providers, settings.provider, update]);

  // The home feed is aggregated server-side across every live provider, so
  // the client needs no provider fan-out — a single request builds all rails.
  // The preferred (default) provider reorders the merge so its content leads.
  useEffect(() => {
    const controller = new AbortController();
    setFeed((current) => current ?? null);
    getFeatured(settings.provider, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setFeed(data ?? EMPTY_FEED);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        dispatch({
          type: 'notice/show',
          message: safeErrorMessage(error),
        });
        setFeed(EMPTY_FEED);
      });
    return () => {
      controller.abort();
    };
  }, [settings.provider]);

  // Clear stale search results and any open detail when the provider
  // changes — links from one provider are meaningless in another.
  // biome-ignore lint/correctness/useExhaustiveDependencies: provider change intentionally re-runs this effect even though the body only uses the stable dispatcher.
  useEffect(() => {
    dispatch({ type: 'results/clear' });
    dispatch({ type: 'selected/close' });
  }, [settings.provider]);

  const debouncedQuery = useDebounce(state.query, 300);

  // Display name from the live registry (the persisted provider may be
  // unknown until the API list loads — then the header shows the app name).
  const providerName = useMemo(
    () =>
      providerById(settings.provider)?.name ??
      providers.providers.find((p) => p.id === settings.provider)?.name ??
      'harustream',
    [settings.provider, providers.providers],
  );

  // Live search: as the user types (>= 2 chars) and we're on the search
  // view, fetch results without pressing Enter.
  useEffect(() => {
    if (state.view !== 'search') return;
    const q = debouncedQuery.trim();
    if (q.length < 2) {
      dispatch({ type: 'results/clear' });
      return;
    }
    const controller = new AbortController();
    dispatch({ type: 'results/loading' });
    searchCatalog(q, '', controller.signal)
      .then((results) => {
        if (!controller.signal.aborted)
          dispatch({ type: 'results/set', results: Array.isArray(results) ? results : [] });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        dispatch({ type: 'results/clear' });
        dispatch({ type: 'notice/show', message: safeErrorMessage(error) });
      });
    return () => {
      controller.abort();
    };
  }, [debouncedQuery, state.view]);

  const onOpen = useCallback(
    async (item: Media) => {
      dispatch({ type: 'selected/set', item });
      try {
        const meta = await getMeta(item.link, item.providerId ?? settings.provider);
        // Guard against the user opening a second card while this meta was
        // in flight — merging would stamp the wrong title's data on the
        // currently-open modal. The reducer drops stale merges by link.
        dispatch({ type: 'selected/merge', link: item.link, meta });
      } catch {
        // Meta is optional; the modal works from the list payload alone.
      }
    },
    [settings.provider],
  );

  // A monotonic session token invalidates in-flight playback work. Bumping it
  // (new play request, modal closed) makes every awaited dispatch a no-op, so
  // a slow stream resolve can't resurrect a closed player or stomp a newer
  // playback session.
  const playerSessionRef = useRef(0);

  // Remember which hub/episode produced the currently-playing stream so that
  // when playback itself fails (undecodable container, dead CDN), the next
  // resolution pass can skip it and fall through to the next candidate.
  const lastMovieHubRef = useRef<string | undefined>(undefined);
  const lastEpisodeRef = useRef<{ link: string; title: string } | undefined>(undefined);
  const lastMetaRef = useRef<Meta | null>(null);
  const resolvingMoreRef = useRef(false);

  const onPlay = useCallback(
    async (item: Media, hubOverride?: string) => {
      const session = ++playerSessionRef.current;
      dispatch({ type: 'player/loading', item, episode: '1', episodes: [] });
      try {
        const meta = await getMeta(item.link, item.providerId ?? settings.provider);
        if (session !== playerSessionRef.current) return;
        lastMetaRef.current = meta;
        const isSeries = (meta.type || item.type) === 'series';
        const hub = hubOverride?.trim() || pickBestHubUrl(meta);
        if (!hub) {
          throw new Error('No playable source for this title');
        }

        if (isSeries) {
          // Series: resolve the per-episode list from the hub, which may be
          // an episodes page or a season page whose meta must be fetched
          // first. Then resolve the first episode's link into a stream.
          const episodes = await resolveSeriesEpisodes(meta, settings.provider, hub);
          if (session !== playerSessionRef.current) return;
          if (episodes.length === 0) {
            throw new Error('No episodes found for this series');
          }
          // Try each episode link in order so one slow/dead episode hub can't
          // block playback of the series.
          const { stream, episode } = await getStreamFallback(episodes, settings.provider);
          if (session !== playerSessionRef.current) return;
          lastEpisodeRef.current = episode;
          lastMovieHubRef.current = undefined;
          dispatch({
            type: 'player/playing',
            item,
            episode: episodes[0].title,
            stream,
            episodes,
          });
          return;
        }

        const { stream, hub: resolvedHub } = await resolveMovieStream(meta, settings.provider);
        if (session !== playerSessionRef.current) return;
        lastMovieHubRef.current = resolvedHub;
        lastEpisodeRef.current = undefined;
        dispatch({
          type: 'player/playing',
          item,
          episode: '1',
          stream,
          episodes: [],
        });
      } catch (error) {
        if (session !== playerSessionRef.current) return;
        dispatch({
          type: 'player/error',
          message: `No playable stream was returned for this title. ${safeErrorMessage(error)}`,
          item,
          episodes: [],
        });
      }
    },
    [settings.provider],
  );

  // Shared search entry point. Takes the query explicitly so history chips
  // and the submit forms can't hit a stale `state.query` closure — dispatch
  // is async, so reading state in the same tick would search the old query.
  const runSearch = useCallback(
    async (query: string) => {
      const q = query.trim();
      if (!q) return;
      dispatch({ type: 'view/set', view: 'search' });
      dispatch({ type: 'results/loading' });
      history.add(q);
      try {
        const results = await searchCatalog(q);
        dispatch({ type: 'results/set', results: Array.isArray(results) ? results : [] });
      } catch (error) {
        dispatch({ type: 'results/clear' });
        dispatch({ type: 'notice/show', message: safeErrorMessage(error) });
      }
    },
    [history.add],
  );

  const onSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      void runSearch(state.query);
    },
    [state.query, runSearch],
  );

  const onSetView = useCallback((view: View) => {
    dispatch({ type: 'view/set', view });
    if (view !== 'search') dispatch({ type: 'results/clear' });
  }, []);

  // Typing in any search field lands the user on the search view so live
  // results appear immediately. Switching to another view clears them.
  const onQueryChange = useCallback(
    (query: string) => {
      if (query.trim() && state.view !== 'search') {
        dispatch({ type: 'view/set', view: 'search' });
      }
      dispatch({ type: 'query/set', query });
    },
    [state.view],
  );

  const onSelectEpisode = useCallback(
    async (item: { link: string; title: string }) => {
      if (state.playing.kind !== 'playing' && state.playing.kind !== 'loading') return;
      const session = ++playerSessionRef.current;
      const parent = state.playing.item;
      // Carry the existing episode list forward so the sidebar doesn't flash
      // empty during the loading→playing cycle.
      const prevEpisodes =
        state.playing.kind === 'playing' || state.playing.kind === 'loading'
          ? state.playing.episodes
          : [];
      dispatch({
        type: 'player/loading',
        item: parent,
        episode: item.title,
        episodes: prevEpisodes,
      });
      try {
        // Series episode entries already point at a per-episode hub URL —
        // no need to re-fetch meta. Just resolve streams for this episode.
        // A failure is remembered so re-clicking doesn't re-wait the full
        // upstream timeout on the same dead link.
        try {
          const stream = await getStream(item.link, 'series', settings.provider);
          if (session !== playerSessionRef.current) return;
          lastEpisodeRef.current = item;
          lastMovieHubRef.current = undefined;
          dispatch({
            type: 'player/playing',
            item: parent,
            episode: item.title,
            stream,
            episodes: prevEpisodes,
          });
        } catch (error) {
          rememberStreamFailure(settings.provider, 'series', item.link);
          throw error;
        }
      } catch (error) {
        if (session !== playerSessionRef.current) return;
        dispatch({
          type: 'player/error',
          message: `No playable stream was returned for this episode. ${safeErrorMessage(error)}`,
          item: parent,
          episodes: prevEpisodes,
        });
      }
    },
    [state.playing, settings.provider],
  );

  // Playback-level fallback: the player walks the sources of the current
  // stream (skipping stalls and hard errors); when they're all exhausted the
  // hub/episode that produced them is marked failed and the whole resolution
  // re-runs — the negative cache skips the dead candidate and the next
  // quality hub (or episode) takes over.
  const onSourcesExhausted = useCallback(async () => {
    if (resolvingMoreRef.current) return;
    if (state.playing.kind !== 'playing') return;
    const session = playerSessionRef.current;
    const item = state.playing.item;
    const prevEpisodes = state.playing.episodes;
    resolvingMoreRef.current = true;
    dispatch({
      type: 'player/loading',
      item,
      episode: state.playing.episode,
      episodes: prevEpisodes,
    });
    try {
      if (prevEpisodes.length > 0) {
        if (lastEpisodeRef.current) {
          rememberStreamFailure(settings.provider, 'series', lastEpisodeRef.current.link);
        }
        const { stream, episode } = await getStreamFallback(prevEpisodes, settings.provider);
        if (session !== playerSessionRef.current) return;
        lastEpisodeRef.current = episode;
        dispatch({
          type: 'player/playing',
          item,
          episode: episode.title,
          stream,
          episodes: prevEpisodes,
        });
        return;
      }
      if (!lastMetaRef.current) throw new Error('No further sources available');
      if (lastMovieHubRef.current) {
        rememberStreamFailure(settings.provider, 'movie', lastMovieHubRef.current);
      }
      const { stream, hub } = await resolveMovieStream(lastMetaRef.current, settings.provider);
      if (session !== playerSessionRef.current) return;
      lastMovieHubRef.current = hub;
      dispatch({
        type: 'player/playing',
        item,
        episode: '1',
        stream,
        episodes: [],
      });
    } catch (error) {
      if (session !== playerSessionRef.current) return;
      dispatch({
        type: 'player/error',
        message: `No playable stream was returned for this title. ${safeErrorMessage(error)}`,
        item,
        episodes: prevEpisodes,
      });
    } finally {
      resolvingMoreRef.current = false;
    }
  }, [state.playing, settings.provider]);

  const featured = feed?.featured ?? [];
  const newest = feed?.newest ?? [];
  const movies = feed?.movies ?? [];
  const series = feed?.series ?? [];
  const hero = featured[0] ?? newest[0];
  const loading = feed === null;

  // Trending reuses the newest pool rotated by one so the hero item
  // (which is newest[0]) leads the home page but doesn't lead the
  // trending rail. Single rotation, no duplicates.
  const trending = useMemo<Media[]>(
    () => (newest.length > 1 ? [...newest.slice(1), newest[0]] : newest),
    [newest],
  );

  return (
    // reducedMotion="user" flattens transform animations app-wide for
    // prefers-reduced-motion users; leaf components additionally pick
    // motion-free variants via usePrefersReducedMotion where stagger
    // offsets would linger.
    <MotionConfig reducedMotion="user">
      <main className="min-h-screen bg-background text-foreground">
        <AnimatePresence initial={false}>
          {state.notice && (
            <Notice
              message={state.notice.message}
              onDismiss={() => dispatch({ type: 'notice/dismiss' })}
            />
          )}
        </AnimatePresence>
        {/* Bottom padding clears the fixed dock (present on every screen size)
          plus the safe-area inset on phones; pt-safe clears the status bar
          now that there's no top bar. */}
        <div className="mx-auto max-w-[1500px] px-4 pt-safe pb-[calc(var(--safe-bottom)+6.5rem)] sm:px-6 sm:pb-20 md:px-8">
          {/* View crossfade: switching views fades the old content out and
            rises the new one in. mode="wait" keeps the two from stacking
            (the scroll position would jump otherwise); initial={false}
            skips the animation on first paint — the Hero has its own
            entrance and the LCP shouldn't wait on this wrapper. */}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={state.view}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: DURATIONS.page, ease: EASE }}
            >
              {state.view === 'home' && (
                <>
                  {loading ? (
                    <HeroSkeleton />
                  ) : (
                    <Hero
                      item={hero ?? null}
                      providerName={providerName}
                      inLibrary={hero ? library.has(hero.link) : false}
                      onPlay={onPlay}
                      onToggleLibrary={library.toggle}
                      onPreloadPlay={preloadPlayer}
                      onSearch={() => {
                        if (state.view !== 'search') dispatch({ type: 'view/set', view: 'search' });
                      }}
                    />
                  )}
                  <ContinueWatching provider={settings.provider} onResume={onPlay} />
                  <Rail
                    title="Newest arrivals"
                    items={newest}
                    onOpen={onOpen}
                    loading={loading}
                    priorityFirst
                  />
                  <Rail
                    title="Trending this week"
                    items={trending}
                    onOpen={onOpen}
                    loading={loading}
                  />
                  {/* Movies & Series sit side-by-side on lg+ using a 2-col CSS
                    grid. Each rail's <section> is one grid cell; the cell's
                    width is half the content area, so basis-[160px] cards
                    reflow correctly. On smaller screens the grid collapses to a
                    single column and the rails stack. */}
                  <div className="grid items-start gap-6 md:grid-cols-2 md:gap-8 xl:gap-10">
                    <motion.div
                      variants={viewFadeUp}
                      initial="hidden"
                      whileInView="visible"
                      viewport={VIEWPORT}
                      className="min-w-0 rounded-3xl border border-border/70 bg-card/35 p-4 shadow-xs sm:p-5"
                    >
                      <Rail title="Movies" items={movies} onOpen={onOpen} loading={loading} />
                    </motion.div>
                    <motion.div
                      variants={viewFadeUp}
                      initial="hidden"
                      whileInView="visible"
                      viewport={VIEWPORT}
                      className="min-w-0 rounded-3xl border border-border/70 bg-card/35 p-4 shadow-xs sm:p-5"
                    >
                      <Rail title="Series" items={series} onOpen={onOpen} loading={loading} />
                    </motion.div>
                  </div>
                </>
              )}
              {state.view === 'search' && (
                <Results
                  query={state.query}
                  results={state.results}
                  loading={state.resultsLoading}
                  history={history.items}
                  onQueryChange={onQueryChange}
                  onSubmit={onSubmit}
                  onOpen={onOpen}
                  onHistoryRemove={history.remove}
                  onHistoryClear={history.clear}
                  onHistorySearch={(q) => {
                    dispatch({ type: 'query/set', query: q });
                    void runSearch(q);
                  }}
                />
              )}
              {state.view === 'library' && (
                <Library
                  items={library.items}
                  provider={settings.provider}
                  onOpen={onOpen}
                  onSearch={() => {
                    if (state.view !== 'search') dispatch({ type: 'view/set', view: 'search' });
                  }}
                />
              )}
              {state.view === 'settings' && (
                <SettingsView
                  settings={settings}
                  update={update}
                  toggleExcludedQuality={toggleExcludedQuality}
                  providers={providers.providers}
                  providersLoading={providers.loading}
                  providersRefreshing={providers.refreshing}
                  providersError={providers.error}
                  refreshProviders={providers.refresh}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
        <FloatingMenu
          view={state.view}
          libraryCount={library.items.length}
          onSetView={onSetView}
          onOpenSearch={() => {
            if (state.view !== 'search') dispatch({ type: 'view/set', view: 'search' });
          }}
        />
        <AnimatePresence>
          {state.selected && (
            <DetailModal
              item={state.selected.item}
              meta={state.selected.meta}
              inLibrary={library.has(state.selected.item.link)}
              excludedQualities={settings.excludedQualities}
              onClose={() => dispatch({ type: 'selected/close' })}
              onPlay={onPlay}
              onToggleLibrary={library.toggle}
              onPreloadPlay={preloadPlayer}
            />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {(state.playing.kind === 'loading' ||
            state.playing.kind === 'playing' ||
            state.playing.kind === 'error') && (
            <PlayerModal
              item={
                state.playing.kind === 'playing' || state.playing.kind === 'loading'
                  ? state.playing.item
                  : (state.playing.item ?? { link: '', title: 'Unknown' })
              }
              stream={state.playing.kind === 'playing' ? state.playing.stream : undefined}
              episodes={state.playing.episodes ?? []}
              activeEpisode={
                state.playing.kind === 'loading' || state.playing.kind === 'playing'
                  ? state.playing.episode
                  : '1'
              }
              loading={state.playing.kind === 'loading'}
              errorMessage={state.playing.kind === 'error' ? state.playing.message : undefined}
              defaultPlaybackRate={settings.defaultPlaybackRate}
              autoAdvance={settings.autoAdvance}
              provider={settings.provider}
              onClose={() => {
                playerSessionRef.current++;
                dispatch({ type: 'player/close' });
              }}
              onSelectEpisode={onSelectEpisode}
              onSourcesExhausted={onSourcesExhausted}
            />
          )}
        </AnimatePresence>
      </main>
    </MotionConfig>
  );
}
