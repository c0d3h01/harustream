import type { VegaProviderDescriptor } from './vegaAdapter';

/**
 * Upstream Vega inventory. These entries are intentionally not auto-enabled:
 * each provider must be ported through adaptVegaProvider and verified against
 * the current normalized contract before it can make network requests.
 */
const providerNames: Record<string, string> = {
  vega: 'Vega',
  movieBox: 'MoviesBox',
  torrentio: 'Torrentio',
  hiAnime: 'HiAnime',
  flixhq: 'FlixHQ',
  showbox: 'Showbox',
  netflixMirror: 'Netflix',
  primeMirror: 'Prime Video',
};

const providerIds = [
  'vega',
  'movieBox',
  'torrentio',
  '1cinevood',
  '4khdhub',
  'Joya9tv',
  'a111477',
  'animetsu',
  'autoEmbed',
  'cinefreak',
  'cinemaLuxe',
  'dooflix',
  'drive',
  'eonMovies',
  'filmyfly',
  'flixhq',
  'gokuHD',
  'guardahd',
  'hdhub4u',
  'hiAnime',
  'katmovies',
  'kickAssAnime',
  'kissKh',
  'kmMovies',
  'luxMovies',
  'mkvDrama',
  'movieBox',
  'movies4u',
  'moviesApi',
  'moviezwap',
  'netflixMirror',
  'ogomovies',
  'primeMirror',
  'primewire',
  'protonMovies',
  'ridoMovies',
  'ringz',
  'showbox',
  'skyMovieHD',
  'theintrodb',
  'tokyoInsider',
  'topmovies',
  'torrentio',
  'uhd',
  'uniquestream',
  'vadapav',
  'vega',
  'world4u',
  'zeefliz',
];

export const vegaProviderInventory: VegaProviderDescriptor[] = providerIds.map((id) => ({
  id,
  name: providerNames[id] ?? id,

  status: 'experimental',
  source: 'vega-adapter',
  note: 'Awaiting contract validation and legal/service health review.',
}));
