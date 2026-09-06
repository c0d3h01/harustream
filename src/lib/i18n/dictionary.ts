/** The English dictionary is the source of truth: its keys define the
 *  Dictionary type every other locale must fully implement, so a missing
 *  translation is a compile error rather than a runtime gap. */

export const en = {
  // Bottom navigation
  'nav.browse': 'Browse',
  'nav.search': 'Search',
  'nav.myList': 'My list',
  'nav.settings': 'Settings',
  'nav.primary': 'Primary',

  // Header search
  'header.searchLabel': 'Search titles',
  'header.searchPlaceholder': 'Search titles…',

  // Title kinds
  'kind.movie': 'Movie',
  'kind.series': 'Series',

  // Home
  'home.railEyebrow': 'Curated rail',
  'home.titlesCount': '{count} titles',
  'home.continueWatching': 'Continue watching',
  'home.onThisDevice': 'On this device',
  'home.clearAll': 'Clear all',
  'home.clearEverything': 'Clear everything?',
  'home.clearAllConfirm': 'Confirm: remove all items from continue watching',
  'home.clearAllAria': 'Clear all watched items',
  'home.removeContinue': 'Remove {title} from continue watching',
  'home.percentWatched': '{percent}% watched',
  'home.noPoster': 'No poster',
  'home.untitled': 'Untitled',
  'home.posterAlt': '{title} poster',
  'home.heroEyebrow': 'Your screen, your stream',
  'home.heroHeading': 'Find something worth watching.',
  'home.heroSub':
    'Browse across your providers, keep your watchlist local, and pick up where you left off.',
  'home.heroCtaBrowse': 'Start browsing',
  'home.heroCtaMoreInfo': 'More info',
  'home.rank': 'Rank',

  // Library
  'library.eyebrow': 'Your library',
  'library.heading': 'My list',
  'library.savedCount': '{count} saved titles on this device',
  'library.emptyHeading': 'Your list is empty',
  'library.emptyHint': 'Save a title from its detail page to see it here.',
  'library.findTitle': 'Find a title',

  // Search page
  'search.discovery': 'Discovery',
  'search.resultsFor': 'Results for “{query}”',
  'search.noResults': 'No titles found',
  'search.noResultsHint': 'Try a broader title or check the spelling.',
  'search.loadingResults': 'Loading search results',
  'search.searchLabel': 'Search movies and series',
  'search.searchPlaceholder': 'Search movies, shows, and anime',
  'search.clearSearch': 'Clear search',
  'search.eyebrow': 'Search',
  'search.pageHeading': 'What do you want to watch?',
  'search.pageSub':
    'Search is shareable, so every result page can be bookmarked or sent to a friend.',

  // Title detail
  'title.episodes': 'Episodes',
  'title.loadingEpisodes': 'Loading episodes…',
  'title.loadingSources': 'Loading sources…',
  'title.noEpisodes': 'No episodes found.',
  'title.sources': 'Sources',
  'title.resolving': 'Resolving sources…',
  'title.play': 'Play',
  'title.autoQuality': 'Auto',
  'title.selectSourcePrompt': 'Select a group or episode to see sources.',
  'title.source': 'Source',
  'title.playNow': 'Play now',
  'title.save': 'Save',
  'title.saved': 'Saved',
  'title.failedSources': 'Failed to load sources',
  'title.failedEpisodes': 'Failed to load episodes',
  'title.playerAria': 'Video player for {title}',
  'title.providerUnavailable': 'Provider unavailable',
  'title.loadFailedHeading': 'This title could not load',
  'title.loadFailedBody':
    'The provider did not respond. Try again, or return to browse the catalog.',
  'errors.backToBrowse': 'Back to browse',

  // TMDB catalog
  'tmdb.trendingEyebrow': 'Trending now',
  'tmdb.trendingMovies': 'Trending movies',
  'tmdb.trendingSeries': 'Trending series',
  'tmdb.topMovies': 'Top rated movies',
  'tmdb.topSeries': 'Top rated series',
  'tmdb.popularMovies': 'Popular movies',
  'tmdb.providersEyebrow': 'Streaming services',
  'tmdb.providersHeading': 'Browse by provider',
  'tmdb.heroEyebrow': '#1 trending this week',
  'tmdb.cast': 'Cast',
  'tmdb.trailers': 'Trailers',
  'tmdb.readMore': 'Read More',
  'tmdb.readLess': 'Read Less',
  'tmdb.collectionTitle': 'Collection',
  'tmdb.muteTrailer': 'Mute trailer',
  'tmdb.unmuteTrailer': 'Unmute trailer',
  'tmdb.moreLike': 'More like this',
  'tmdb.collection': 'Part of {name}',
  'tmdb.director': 'Director',
  'tmdb.runtime': 'Runtime',
  'tmdb.seasons': 'Seasons',
  'tmdb.release': 'Release',
  'tmdb.budget': 'Budget',
  'tmdb.revenue': 'Revenue',
  'tmdb.language': 'Language',
  'tmdb.configHeading': 'Catalog unavailable',
  'tmdb.configBody': 'Add TMDB_API_KEY to the server environment to load artwork and listings.',
  'tmdb.findingStream': 'Finding a playable stream…',
  'tmdb.noStream': 'No provider has this title yet',
  'tmdb.chooseSource': 'Choose a source',
  'tmdb.availableOn': 'Available on',
  'tmdb.bestMatch': 'Best match',
  'tmdb.findStream': 'Find stream',
  'tmdb.back': 'Back',

  // Watch screen
  'watch.findingSource': 'Finding a playable source…',
  'watch.unavailable': 'Playback unavailable',
  'watch.backToTitle': 'Back to title',
  'watch.tryAgain': 'Try again',
  'watch.loadFailed': 'Playback could not load.',

  // Player controls
  'player.resumeFrom': 'Resume from {time}?',
  'player.resume': 'Resume',
  'player.startOver': 'Start over',
  'player.seek': 'Seek',
  'player.play': 'Play',
  'player.pause': 'Pause',
  'player.seekBack': 'Seek back 10 seconds',
  'player.seekForward': 'Seek forward 10 seconds',
  'player.fullscreen': 'Fullscreen',
  'player.sourcePicker': 'Source',
  'player.subtitlesPicker': 'Subtitles',
  'player.episodePicker': 'Episode',
  'player.subtitlesOff': 'Subtitles off',
  'player.stalledHint': 'Still stuck? Switch source',

  // Settings
  'settings.eyebrow': 'Preferences',
  'settings.heading': 'Settings',
  'settings.description':
    'These preferences stay in your browser. Nothing here is sent to a server.',
  'settings.playback': 'Playback',
  'settings.autoPlayNext': 'Auto-play next episode',
  'settings.autoPlayNextHint':
    'When an episode finishes, the next one starts playing right away — no need to tap anything.',
  'settings.provider': 'Provider',
  'settings.libraryProvider': 'Library provider',
  'settings.appearance': 'Appearance',
  'settings.language': 'Language',
  'settings.languageAuto': 'Auto (browser)',
  'settings.languageHint': 'Choose the app language, or let it follow your browser preference.',

  // Error boundaries
  'errors.somethingWrong': 'Something went wrong',
  'errors.unexpectedHeading': 'We hit an unexpected error',
  'errors.tryAgainHint': 'Try again — the next render may succeed.',
  'errors.tryAgain': 'Try again',
  'errors.notFoundHeading': 'Page not found',
  'errors.notFoundBody': 'The page you’re looking for has moved or never existed.',
  'errors.backHome': 'Back to home',

  // Notices and toasts
  'notice.dismiss': 'Dismiss notice',
  'toast.close': 'Close toast',
  'toast.devTitle': 'harustream is under development',
  'toast.devBody': 'Things may change or break without warning. Thanks for testing!',
};

export type TranslationKey = keyof typeof en;
export type Dictionary = Record<TranslationKey, string>;

export type Translator = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/** Replaces `{name}` tokens with provided vars; unknown tokens pass through. */
export function createTranslator(dict: Dictionary): Translator {
  return (key, vars) => {
    if (!vars) return dict[key];
    return dict[key].replace(/\{(\w+)\}/g, (token, name: string) =>
      Object.hasOwn(vars, name) ? String(vars[name]) : token,
    );
  };
}
