'use client';

import { Loader2 } from 'lucide-react';
import dynamic from 'next/dynamic';
import { type FormEvent, useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import {
  type FeaturedFeed,
  getFeatured,
  getMeta,
  getStream,
  getStreamFallback,
  type Media,
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
import { Header } from './Header';
import { ContinueWatching } from './home/ContinueWatching';
import { Hero } from './home/Hero';
import { HeroSkeleton } from './home/HeroSkeleton';
import { Rail } from './home/Rail';
import { Library } from './library/Library';
import { MobileNav } from './MobileNav';
import { Notice } from './Notice';
import { Results } from './search/Results';
import { SettingsView } from './settings/SettingsView';

// The player bundles hls.js (~500KB), which would bloat the first paint if
// loaded eagerly. Both overlays only mount on user interaction, so they're
// code-split and fetched on demand. The player gets a loading fallback so
// tapping "Play" shows immediate feedback while its chunk loads.
const DetailModal = dynamic(() => import('./player/DetailModal').then((m) => m.DetailModal));
const PlayerModal = dynamic(() => import('./player/PlayerModal').then((m) => m.PlayerModal), {
  loading: PlayerLoader,
});

function PlayerLoader() {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background">
      <Loader2 className="size-10 animate-spin text-primary" aria-hidden="true" />
      <span className="sr-only">Loading player…</span>
    </div>
  );
}

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
  // Lifted to App so the MobileNav "Search" item can open the same bar
  // the header's search icon opens. Keeping it in Header would force the
  // nav to dispatch a custom event or grow a ref.
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  // Apply the active theme to <html>. The layout's inline script already
  // restored the persisted theme pre-hydration, so this only reacts to
  // changes made inside the settings view.
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  // The persisted provider may no longer be served by the API (the picker
  // reflects the live list, not a hardcoded registry). Once the live list is
  // known, switch to the first available provider instead of leaving every
  // request to 400 upstream.
  useEffect(() => {
    if (providers.loading) return;
    if (providers.providers.length === 0) return;
    if (providers.providers.some((p) => p.id === settings.provider)) return;
    update({ provider: providers.providers[0].id });
  }, [providers.loading, providers.providers, settings.provider, update]);

  // Featured feed loads on mount and whenever the active provider changes
  // (each provider serves a different catalog). Reset to the skeleton state
  // before refetching so the old provider's rails don't linger.
  useEffect(() => {
    let cancelled = false;
    setFeed(null);
    getFeatured(settings.provider)
      .then((data) => {
        if (!cancelled) setFeed(data ?? EMPTY_FEED);
      })
      .catch((error) => {
        if (!cancelled) {
          dispatch({
            type: 'notice/show',
            message: safeErrorMessage(error),
          });
          setFeed(EMPTY_FEED);
        }
      });
    return () => {
      cancelled = true;
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
    let cancelled = false;
    dispatch({ type: 'results/loading' });
    searchCatalog(q, settings.provider)
      .then((data) => {
        if (!cancelled) dispatch({ type: 'results/set', results: Array.isArray(data) ? data : [] });
      })
      .catch((error) => {
        if (!cancelled) {
          dispatch({ type: 'results/clear' });
          dispatch({ type: 'notice/show', message: safeErrorMessage(error) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, state.view, settings.provider]);

  const onOpen = useCallback(
    async (item: Media) => {
      dispatch({ type: 'selected/set', item });
      try {
        const meta = await getMeta(item.link, settings.provider);
        dispatch({ type: 'selected/merge', meta });
      } catch {
        // Meta is optional; the modal works from the list payload alone.
      }
    },
    [settings.provider],
  );

  const onPlay = useCallback(
    async (item: Media, hubOverride?: string) => {
      dispatch({ type: 'player/loading', item, episode: '1', episodes: [] });
      try {
        const meta = await getMeta(item.link, settings.provider);
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
          if (episodes.length === 0) {
            throw new Error('No episodes found for this series');
          }
          // Try each episode link in order so one slow/dead episode hub can't
          // block playback of the series.
          const stream = await getStreamFallback(episodes, settings.provider);
          dispatch({
            type: 'player/playing',
            item,
            episode: episodes[0].title,
            stream,
            episodes,
          });
          return;
        }

        const stream = await resolveMovieStream(meta, settings.provider);
        dispatch({
          type: 'player/playing',
          item,
          episode: '1',
          stream,
          episodes: [],
        });
      } catch (error) {
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

  const onSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      const q = state.query.trim();
      if (!q) return;
      dispatch({ type: 'view/set', view: 'search' });
      dispatch({ type: 'results/loading' });
      history.add(q);
      try {
        const data = await searchCatalog(q, settings.provider);
        dispatch({ type: 'results/set', results: Array.isArray(data) ? data : [] });
      } catch (error) {
        dispatch({ type: 'results/clear' });
        dispatch({ type: 'notice/show', message: safeErrorMessage(error) });
      }
    },
    [state.query, history.add, settings.provider],
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
    <main className="min-h-screen bg-background text-foreground">
      <Header
        view={state.view}
        query={state.query}
        providerName={providerName}
        mobileSearchOpen={mobileSearchOpen}
        onSetMobileSearchOpen={setMobileSearchOpen}
        onSetView={onSetView}
        onQueryChange={onQueryChange}
        onSubmit={onSubmit}
        libraryCount={library.items.length}
      />
      {state.notice && (
        <Notice
          message={state.notice.message}
          onDismiss={() => dispatch({ type: 'notice/dismiss' })}
        />
      )}
      {/* Bottom padding accounts for the fixed MobileNav on phones (h-14
          plus the safe-area inset). md+ uses a calmer gutter. */}
      <div className="mx-auto max-w-[1500px] px-4 pb-[calc(var(--safe-bottom)+4rem)] sm:px-6 sm:pb-16 md:px-8">
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
              />
            )}
            <ContinueWatching provider={settings.provider} onResume={onPlay} />
            <Rail title="Newest arrivals" items={newest} onOpen={onOpen} loading={loading} />
            <Rail title="Trending this week" items={trending} onOpen={onOpen} loading={loading} />
            {/* Movies & Series sit side-by-side on lg+ using a 2-col CSS
                grid. Each rail's <section> is one grid cell; the cell's
                width is half the content area, so basis-[160px] cards
                reflow correctly. On smaller screens the grid collapses to a
                single column and the rails stack. */}
            <div className="grid gap-2 lg:grid-cols-2">
              <Rail title="Movies" items={movies} onOpen={onOpen} loading={loading} />
              <Rail title="Series" items={series} onOpen={onOpen} loading={loading} />
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
              onSubmit({ preventDefault: () => {} } as FormEvent);
            }}
          />
        )}
        {state.view === 'library' && (
          <Library
            items={library.items}
            onOpen={onOpen}
            onSearch={() => {
              setMobileSearchOpen(true);
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
      </div>
      <MobileNav
        view={state.view}
        libraryCount={library.items.length}
        onSetView={onSetView}
        onOpenSearch={() => {
          setMobileSearchOpen(true);
          if (state.view !== 'search') dispatch({ type: 'view/set', view: 'search' });
        }}
      />
      {state.selected && (
        <DetailModal
          item={state.selected.item}
          meta={state.selected.meta}
          inLibrary={library.has(state.selected.item.link)}
          excludedQualities={settings.excludedQualities}
          onClose={() => dispatch({ type: 'selected/close' })}
          onPlay={onPlay}
          onToggleLibrary={library.toggle}
        />
      )}
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
          defaultAutoAdvance={settings.autoAdvance}
          provider={settings.provider}
          onClose={() => dispatch({ type: 'player/close' })}
          onSelectEpisode={onSelectEpisode}
        />
      )}
    </main>
  );
}
