import { z } from 'zod';

const genre = z.object({ id: z.number(), name: z.string() });
const company = z.object({ name: z.string(), logo_path: z.string().nullable().optional() });
const castMember = z.object({
  id: z.number().int(),
  name: z.string(),
  character: z.string().default(''),
  profile_path: z.string().nullable().optional(),
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
});
const imageFile = z.object({ file_path: z.string(), iso_639_1: z.string().nullable().optional() });
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
  belongs_to_collection: z
    .object({
      id: z.number().int(),
      name: z.string(),
      poster_path: z.string().nullable().optional(),
      backdrop_path: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  imdb_id: z.string().nullable().optional(),
  credits: z.object({ cast: z.array(castMember), crew: z.array(crewMember) }).optional(),
  videos: z.object({ results: z.array(video) }).optional(),
  images: z.object({ logos: z.array(imageFile) }).optional(),
  recommendations: z.object({ results: z.array(movieItem) }).optional(),
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
  images: z.object({ logos: z.array(imageFile) }).optional(),
  recommendations: z.object({ results: z.array(tvItem) }).optional(),
});

export const tmdbCollectionSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  overview: z.string().default(''),
  poster_path: z.string().nullable().optional(),
  backdrop_path: z.string().nullable().optional(),
  parts: z.array(movieItem).default([]),
});

export type TmdbCastMember = z.infer<typeof castMember>;
