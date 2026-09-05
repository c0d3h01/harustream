import type {
  TmdbCollection,
  TmdbMovieDetails,
  TmdbMovieItem,
  TmdbMultiItem,
  TmdbTvDetails,
  TmdbTvItem,
  TmdbWatchProviderListEntry,
} from '@/validations/tmdb';
import {
  tmdbCollectionSchema,
  tmdbMovieDetailsSchema,
  tmdbMoviePagedSchema,
  tmdbMultiPagedSchema,
  tmdbTvDetailsSchema,
  tmdbTvPagedSchema,
  tmdbWatchProviderListSchema,
} from '@/validations/tmdb';
import { tmdbFetch } from './client';
import { tmdbLocale } from './locale';

export type TmdbKind = 'movie' | 'tv';

export interface TmdbCard {
  kind: TmdbKind;
  tmdbId: number;
  title: string;
  originalTitle: string;
  overview: string;
  posterPath?: string;
  backdropPath?: string;
  year?: string;
  rating: number;
}

export interface TmdbRail {
  title: string;
  items: TmdbCard[];
}

export interface TmdbCastMember {
  id: number;
  name: string;
  character: string;
  profilePath?: string;
}

export interface TmdbTrailer {
  id: string;
  key: string;
  name: string;
}

export interface TmdbWatchProvider {
  id: number;
  name: string;
  logoPath?: string;
}

export interface TmdbDetail {
  kind: TmdbKind;
  tmdbId: number;
  title: string;
  originalTitle: string;
  overview: string;
  posterPath?: string;
  backdropPath?: string;
  logoPath?: string;
  year?: string;
  dateLabel?: string;
  runtime?: string;
  seasons?: number;
  language?: string;
  rating: number;
  genres: string[];
  budget?: number;
  revenue?: number;
  imdbId?: string;
  director?: string;
  cast: TmdbCastMember[];
  trailers: TmdbTrailer[];
  recommendations: TmdbCard[];
  watchProviders: TmdbWatchProvider[];
  collection?: { id: number; name: string; posterPath?: string; backdropPath?: string };
  companies: { name: string; logoPath?: string }[];
}

const RAIL_TTL_MS = 600_000;
const DETAILS_TTL_MS = 3_600_000;
const SEARCH_TTL_MS = 30_000;
const PROVIDERS_TTL_MS = 86_400_000;

function yearOf(date: string | undefined): string | undefined {
  const year = date?.slice(0, 4);
  return year && /^\d{4}$/.test(year) ? year : undefined;
}

function optional(path: string | null | undefined): string | undefined {
  return path ?? undefined;
}

function movieCard(item: TmdbMovieItem): TmdbCard {
  return {
    kind: 'movie',
    tmdbId: item.id,
    title: item.title || item.original_title || 'Untitled',
    originalTitle: item.original_title,
    overview: item.overview,
    posterPath: optional(item.poster_path),
    backdropPath: optional(item.backdrop_path),
    year: yearOf(item.release_date),
    rating: item.vote_average,
  };
}

function tvCard(item: TmdbTvItem): TmdbCard {
  return {
    kind: 'tv',
    tmdbId: item.id,
    title: item.name || item.original_name || 'Untitled',
    originalTitle: item.original_name,
    overview: item.overview,
    posterPath: optional(item.poster_path),
    backdropPath: optional(item.backdrop_path),
    year: yearOf(item.first_air_date),
    rating: item.vote_average,
  };
}

function multiCard(item: TmdbMultiItem): TmdbCard | null {
  if (item.media_type === 'movie') {
    return movieCard({
      id: item.id,
      title: item.title || item.name,
      original_title: item.original_title || item.original_name,
      overview: item.overview,
      poster_path: item.poster_path,
      backdrop_path: item.backdrop_path,
      release_date: item.release_date,
      vote_average: item.vote_average,
      genre_ids: item.genre_ids,
      popularity: item.popularity,
    });
  }
  if (item.media_type === 'tv') {
    return tvCard({
      id: item.id,
      name: item.name || item.title,
      original_name: item.original_name || item.original_title,
      overview: item.overview,
      poster_path: item.poster_path,
      backdrop_path: item.backdrop_path,
      first_air_date: item.first_air_date,
      vote_average: item.vote_average,
      genre_ids: item.genre_ids,
      popularity: item.popularity,
    });
  }
  return null;
}

function castOf(
  members: { id: number; name: string; character: string; profile_path?: string | null }[],
): TmdbCastMember[] {
  return members.slice(0, 20).map((member) => ({
    id: member.id,
    name: member.name,
    character: member.character,
    profilePath: optional(member.profile_path),
  }));
}

function trailersOf(
  videos: { id: string; key: string; site: string; type: string; name: string }[] | undefined,
): TmdbTrailer[] {
  return (videos ?? [])
    .filter(
      (video) => video.site === 'YouTube' && (video.type === 'Trailer' || video.type === 'Teaser'),
    )
    .slice(0, 6)
    .map((video) => ({ id: video.id, key: video.key, name: video.name }));
}

function logoOf(
  logos: { file_path: string; iso_639_1?: string | null }[] | undefined,
  language: string,
): string | undefined {
  if (!logos?.length) return undefined;
  const prefix = language.slice(0, 2).toLowerCase();
  return (
    logos.find((logo) => (logo.iso_639_1 ?? '').toLowerCase() === prefix)?.file_path ??
    logos.find((logo) => logo.iso_639_1 === 'en')?.file_path ??
    logos[0]?.file_path
  );
}

export async function getTrending(locale: string, kind: TmdbKind): Promise<TmdbCard[]> {
  const { language } = tmdbLocale(locale);
  const path = kind === 'movie' ? '/trending/movie/week' : '/trending/tv/week';
  const schema = kind === 'movie' ? tmdbMoviePagedSchema : tmdbTvPagedSchema;
  const data = await tmdbFetch(schema, path, { language }, { ttlMs: RAIL_TTL_MS });
  return data.results.map((item) =>
    kind === 'movie' ? movieCard(item as TmdbMovieItem) : tvCard(item as TmdbTvItem),
  );
}

export async function getTopRated(locale: string, kind: TmdbKind): Promise<TmdbCard[]> {
  const { language, region } = tmdbLocale(locale);
  const path = kind === 'movie' ? '/movie/top_rated' : '/tv/top_rated';
  const schema = kind === 'movie' ? tmdbMoviePagedSchema : tmdbTvPagedSchema;
  const data = await tmdbFetch(schema, path, { language, region }, { ttlMs: RAIL_TTL_MS });
  return data.results.map((item) =>
    kind === 'movie' ? movieCard(item as TmdbMovieItem) : tvCard(item as TmdbTvItem),
  );
}

export async function getPopular(locale: string, kind: TmdbKind): Promise<TmdbCard[]> {
  const { language, region } = tmdbLocale(locale);
  const path = kind === 'movie' ? '/movie/popular' : '/tv/popular';
  const schema = kind === 'movie' ? tmdbMoviePagedSchema : tmdbTvPagedSchema;
  const data = await tmdbFetch(schema, path, { language, region }, { ttlMs: RAIL_TTL_MS });
  return data.results.map((item) =>
    kind === 'movie' ? movieCard(item as TmdbMovieItem) : tvCard(item as TmdbTvItem),
  );
}

export async function searchTmdb(locale: string, query: string, page = 1): Promise<TmdbCard[]> {
  const { language, region } = tmdbLocale(locale);
  const data = await tmdbFetch(
    tmdbMultiPagedSchema,
    '/search/multi',
    { language, region, query, page: String(page), include_adult: 'false' },
    { ttlMs: SEARCH_TTL_MS },
  );
  const cards: TmdbCard[] = [];
  for (const item of data.results) {
    const card = multiCard(item);
    if (card) cards.push(card);
  }
  return cards;
}

export async function getWatchProviderList(
  locale: string,
  kind: TmdbKind,
): Promise<TmdbWatchProvider[]> {
  const { region } = tmdbLocale(locale);
  const data = await tmdbFetch(
    tmdbWatchProviderListSchema,
    `/watch/providers/${kind}`,
    { watch_region: region },
    { ttlMs: PROVIDERS_TTL_MS },
  );
  const rank = (entry: TmdbWatchProviderListEntry): number =>
    entry.display_priorities[region] ?? Number.MAX_SAFE_INTEGER;
  return [...data.results]
    .sort((left, right) => rank(left) - rank(right))
    .slice(0, 14)
    .map((entry) => ({
      id: entry.provider_id,
      name: entry.provider_name,
      logoPath: optional(entry.logo_path),
    }));
}

export async function discoverByWatchProvider(
  locale: string,
  kind: TmdbKind,
  providerId: number,
): Promise<TmdbCard[]> {
  const { language, region } = tmdbLocale(locale);
  const path = kind === 'movie' ? '/discover/movie' : '/discover/tv';
  const schema = kind === 'movie' ? tmdbMoviePagedSchema : tmdbTvPagedSchema;
  const data = await tmdbFetch(
    schema,
    path,
    {
      language,
      watch_region: region,
      with_watch_providers: String(providerId),
      sort_by: 'popularity.desc',
    },
    { ttlMs: RAIL_TTL_MS },
  );
  return data.results.map((item) =>
    kind === 'movie' ? movieCard(item as TmdbMovieItem) : tvCard(item as TmdbTvItem),
  );
}

function formatRuntime(minutes?: number | null): string | undefined {
  if (!minutes) return undefined;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours}h ${rest}m` : `${rest}m`;
}

function watchProvidersFor(
  sections:
    | Record<
        string,
        { flatrate?: { provider_id: number; provider_name: string; logo_path?: string | null }[] }
      >
    | undefined,
  region: string,
): TmdbWatchProvider[] {
  const entries = sections?.[region]?.flatrate ?? [];
  return entries.slice(0, 12).map((entry) => ({
    id: entry.provider_id,
    name: entry.provider_name,
    logoPath: optional(entry.logo_path),
  }));
}

export async function getMovieDetails(locale: string, id: number): Promise<TmdbDetail> {
  const { language, region } = tmdbLocale(locale);
  const data: TmdbMovieDetails = await tmdbFetch(
    tmdbMovieDetailsSchema,
    `/movie/${id}`,
    {
      language,
      append_to_response: 'credits,videos,images,recommendations,watch/providers',
      include_image_language: 'en,null',
    },
    { ttlMs: DETAILS_TTL_MS },
  );
  const director = data.credits?.crew.find(
    (member) => member.job === 'Director' && member.department === 'Directing',
  )?.name;
  return {
    kind: 'movie',
    tmdbId: data.id,
    title: data.title || data.original_title || 'Untitled',
    originalTitle: data.original_title,
    overview: data.overview,
    posterPath: optional(data.poster_path),
    backdropPath: optional(data.backdrop_path),
    logoPath: logoOf(data.images?.logos, language),
    year: yearOf(data.release_date),
    dateLabel: data.release_date || undefined,
    runtime: formatRuntime(data.runtime),
    language: data.original_language?.toUpperCase() || undefined,
    rating: data.vote_average,
    genres: (data.genres ?? []).map((genre) => genre.name),
    budget: data.budget || undefined,
    revenue: data.revenue || undefined,
    imdbId: data.imdb_id ?? undefined,
    director,
    cast: castOf(data.credits?.cast ?? []),
    trailers: trailersOf(data.videos?.results),
    recommendations: (data.recommendations?.results ?? []).slice(0, 12).map(movieCard),
    watchProviders: watchProvidersFor(data['watch/providers']?.results, region),
    collection: data.belongs_to_collection
      ? {
          id: data.belongs_to_collection.id,
          name: data.belongs_to_collection.name,
          posterPath: optional(data.belongs_to_collection.poster_path),
          backdropPath: optional(data.belongs_to_collection.backdrop_path),
        }
      : undefined,
    companies: (data.production_companies ?? []).slice(0, 6).map((company) => ({
      name: company.name,
      logoPath: optional(company.logo_path),
    })),
  };
}

export async function getTvDetails(locale: string, id: number): Promise<TmdbDetail> {
  const { language, region } = tmdbLocale(locale);
  const data: TmdbTvDetails = await tmdbFetch(
    tmdbTvDetailsSchema,
    `/tv/${id}`,
    {
      language,
      append_to_response: 'credits,videos,images,recommendations,watch/providers',
      include_image_language: 'en,null',
    },
    { ttlMs: DETAILS_TTL_MS },
  );
  const runtimes = data.episode_run_time ?? [];
  return {
    kind: 'tv',
    tmdbId: data.id,
    title: data.name || data.original_name || 'Untitled',
    originalTitle: data.original_name,
    overview: data.overview,
    posterPath: optional(data.poster_path),
    backdropPath: optional(data.backdrop_path),
    logoPath: logoOf(data.images?.logos, language),
    year: yearOf(data.first_air_date),
    dateLabel: data.first_air_date || undefined,
    runtime: runtimes.length > 0 ? `~${runtimes[0]}m / ep` : undefined,
    seasons: data.number_of_seasons || undefined,
    language: data.original_language?.toUpperCase() || undefined,
    rating: data.vote_average,
    genres: (data.genres ?? []).map((genre) => genre.name),
    cast: castOf(data.credits?.cast ?? []),
    trailers: trailersOf(data.videos?.results),
    recommendations: (data.recommendations?.results ?? []).slice(0, 12).map(tvCard),
    watchProviders: watchProvidersFor(data['watch/providers']?.results, region),
    companies: (data.production_companies ?? []).slice(0, 6).map((company) => ({
      name: company.name,
      logoPath: optional(company.logo_path),
    })),
  };
}

export async function getCollection(
  locale: string,
  id: number,
): Promise<{
  id: number;
  name: string;
  overview: string;
  posterPath?: string;
  backdropPath?: string;
  parts: TmdbCard[];
}> {
  const { language } = tmdbLocale(locale);
  const data: TmdbCollection = await tmdbFetch(
    tmdbCollectionSchema,
    `/collection/${id}`,
    { language },
    { ttlMs: DETAILS_TTL_MS },
  );
  return {
    id: data.id,
    name: data.name,
    overview: data.overview,
    posterPath: optional(data.poster_path),
    backdropPath: optional(data.backdrop_path),
    parts: (data.parts ?? []).map(movieCard),
  };
}
