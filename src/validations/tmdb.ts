import { z } from 'zod';

// Zod schemas for themoviedb.org v3 responses. TMDB adds fields freely, so
// every schema pins only what the app reads — unknown keys are stripped.
// Nullable art paths stay nullable; mapping code turns them into undefined.

const movieItem = z.object({
  id: z.number().int().positive(),
  title: z.string().default(''),
  original_title: z.string().default(''),
  overview: z.string().default(''),
  poster_path: z.string().nullable().optional(),
  backdrop_path: z.string().nullable().optional(),
  release_date: z.string().default(''),
  vote_average: z.number().default(0),
  genre_ids: z.array(z.number()).default([]),
  popularity: z.number().default(0),
});

const tvItem = z.object({
  id: z.number().int().positive(),
  name: z.string().default(''),
  original_name: z.string().default(''),
  overview: z.string().default(''),
  poster_path: z.string().nullable().optional(),
  backdrop_path: z.string().nullable().optional(),
  first_air_date: z.string().default(''),
  vote_average: z.number().default(0),
  genre_ids: z.array(z.number()).default([]),
  popularity: z.number().default(0),
});

const paged = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    page: z.number().default(1),
    results: z.array(item),
    total_pages: z.number().default(1),
    total_results: z.number().default(0),
  });

export const tmdbMoviePagedSchema = paged(movieItem);
export const tmdbTvPagedSchema = paged(tvItem);

const multiItem = z.object({
  media_type: z.string().default(''),
  id: z.number().int().positive(),
  title: z.string().default(''),
  name: z.string().default(''),
  original_title: z.string().default(''),
  original_name: z.string().default(''),
  overview: z.string().default(''),
  poster_path: z.string().nullable().optional(),
  backdrop_path: z.string().nullable().optional(),
  release_date: z.string().default(''),
  first_air_date: z.string().default(''),
  vote_average: z.number().default(0),
  genre_ids: z.array(z.number()).default([]),
  popularity: z.number().default(0),
});

export const tmdbMultiPagedSchema = paged(multiItem);

const genre = z.object({ id: z.number(), name: z.string() });

const company = z.object({
  name: z.string(),
  logo_path: z.string().nullable().optional(),
});

const castMember = z.object({
  id: z.number().int(),
  name: z.string(),
  character: z.string().default(''),
  profile_path: z.string().nullable().optional(),
  order: z.number().default(0),
});

const crewMember = z.object({
  id: z.number().int(),
  name: z.string(),
  job: z.string().default(''),
  department: z.string().default(''),
});

const video = z.object({
  id: z.string(),
  key: z.string(),
  site: z.string().default(''),
  name: z.string().default(''),
  type: z.string().default(''),
  official: z.boolean().default(false),
});

const imageFile = z.object({
  file_path: z.string(),
  iso_639_1: z.string().nullable().optional(),
});

const watchProviderEntry = z.object({
  provider_id: z.number().int(),
  provider_name: z.string(),
  logo_path: z.string().nullable().optional(),
  display_priority: z.number().default(0),
});

const regionProviders = z.object({
  link: z.string().default(''),
  flatrate: z.array(watchProviderEntry).default([]),
  rent: z.array(watchProviderEntry).default([]),
  buy: z.array(watchProviderEntry).default([]),
});

const collectionRef = z.object({
  id: z.number().int(),
  name: z.string(),
  poster_path: z.string().nullable().optional(),
  backdrop_path: z.string().nullable().optional(),
});

export const tmdbMovieDetailsSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().default(''),
  original_title: z.string().default(''),
  overview: z.string().default(''),
  poster_path: z.string().nullable().optional(),
  backdrop_path: z.string().nullable().optional(),
  release_date: z.string().default(''),
  runtime: z.number().nullable().optional(),
  budget: z.number().default(0),
  revenue: z.number().default(0),
  original_language: z.string().default(''),
  vote_average: z.number().default(0),
  genres: z.array(genre).default([]),
  production_companies: z.array(company).default([]),
  belongs_to_collection: collectionRef.nullable().optional(),
  imdb_id: z.string().nullable().optional(),
  credits: z.object({ cast: z.array(castMember), crew: z.array(crewMember) }).optional(),
  videos: z.object({ results: z.array(video) }).optional(),
  images: z.object({ backdrops: z.array(imageFile), logos: z.array(imageFile) }).optional(),
  recommendations: z.object({ results: z.array(movieItem) }).optional(),
  'watch/providers': z.object({ results: z.record(regionProviders) }).optional(),
});

export const tmdbTvDetailsSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().default(''),
  original_name: z.string().default(''),
  overview: z.string().default(''),
  poster_path: z.string().nullable().optional(),
  backdrop_path: z.string().nullable().optional(),
  first_air_date: z.string().default(''),
  number_of_seasons: z.number().default(0),
  episode_run_time: z.array(z.number()).default([]),
  original_language: z.string().default(''),
  vote_average: z.number().default(0),
  genres: z.array(genre).default([]),
  production_companies: z.array(company).default([]),
  credits: z.object({ cast: z.array(castMember), crew: z.array(crewMember) }).optional(),
  videos: z.object({ results: z.array(video) }).optional(),
  images: z.object({ backdrops: z.array(imageFile), logos: z.array(imageFile) }).optional(),
  recommendations: z.object({ results: z.array(tvItem) }).optional(),
  'watch/providers': z.object({ results: z.record(regionProviders) }).optional(),
});

const watchProviderListEntry = z.object({
  provider_id: z.number().int(),
  provider_name: z.string(),
  logo_path: z.string().nullable().optional(),
  display_priorities: z.record(z.number()).default({}),
});

export const tmdbWatchProviderListSchema = z.object({
  results: z.array(watchProviderListEntry),
});

export const tmdbCollectionSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  overview: z.string().default(''),
  poster_path: z.string().nullable().optional(),
  backdrop_path: z.string().nullable().optional(),
  parts: z.array(movieItem).default([]),
});

export type TmdbMovieItem = z.infer<typeof movieItem>;
export type TmdbTvItem = z.infer<typeof tvItem>;
export type TmdbMultiItem = z.infer<typeof multiItem>;
export type TmdbMovieDetails = z.infer<typeof tmdbMovieDetailsSchema>;
export type TmdbTvDetails = z.infer<typeof tmdbTvDetailsSchema>;
export type TmdbWatchProviderListEntry = z.infer<typeof watchProviderListEntry>;
export type TmdbCollection = z.infer<typeof tmdbCollectionSchema>;
