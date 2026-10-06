import type { z } from 'zod';
import {
  tmdbCollectionSchema,
  tmdbMovieDetailsSchema,
  tmdbMoviePagedSchema,
  tmdbTvDetailsSchema,
  tmdbTvPagedSchema,
} from '@/validations/tmdb';
import { tmdbFetch } from './client';

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
  collection?: { id: number; name: string; posterPath?: string; backdropPath?: string };
  companies: { name: string; logoPath?: string }[];
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

const DETAILS_TTL_MS = 3_600_000;
const LIST_TTL_MS = 600_000;

export async function getDetails(kind: TmdbKind, id: number): Promise<TmdbDetail> {
  const params = {
    language: 'en-US',
    append_to_response: 'credits,videos,images,recommendations',
    include_image_language: 'en,null',
  };
  const schema = kind === 'movie' ? tmdbMovieDetailsSchema : tmdbTvDetailsSchema;
  const data = await tmdbFetch(schema, `/${kind}/${id}`, params, { ttlMs: DETAILS_TTL_MS });
  const director = data.credits?.crew.find(
    (member) => member.job === 'Director' && member.department === 'Directing',
  )?.name;
  const language = 'en-US';
  const logos = data.images?.logos;
  const base = {
    tmdbId: data.id,
    overview: data.overview,
    posterPath: data.poster_path ?? undefined,
    backdropPath: data.backdrop_path ?? undefined,
    logoPath: logos?.length
      ? (logos.find((l) => (l.iso_639_1 ?? '').toLowerCase() === language.slice(0, 2).toLowerCase())
          ?.file_path ??
        logos.find((l) => l.iso_639_1 === 'en')?.file_path ??
        logos[0]?.file_path)
      : undefined,
    language: data.original_language?.toUpperCase() || undefined,
    rating: data.vote_average,
    genres: (data.genres ?? []).map((g) => g.name),
    cast: (data.credits?.cast ?? []).slice(0, 20).map((m) => ({
      id: m.id,
      name: m.name,
      character: m.character,
      profilePath: m.profile_path ?? undefined,
    })),
    trailers: (data.videos?.results ?? [])
      .filter((v) => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'))
      .slice(0, 6)
      .map((v) => ({ id: v.id, key: v.key, name: v.name })),
    companies: (data.production_companies ?? []).slice(0, 6).map((c) => ({
      name: c.name,
      logoPath: c.logo_path ?? undefined,
    })),
  };
  if (kind === 'movie') {
    const d = data as z.infer<typeof tmdbMovieDetailsSchema>;
    let runtime: string | undefined;
    if (d.runtime) {
      const hours = Math.floor(d.runtime / 60);
      const remainder = d.runtime % 60;
      runtime = hours > 0 ? `${hours}h ${remainder}m` : `${remainder}m`;
    }
    return {
      ...base,
      kind: 'movie',
      title: d.title || d.original_title || 'Untitled',
      originalTitle: d.original_title,
      year: yearOf(d.release_date),
      dateLabel: d.release_date || undefined,
      runtime,
      director,
      budget: d.budget || undefined,
      revenue: d.revenue || undefined,
      imdbId: d.imdb_id ?? undefined,
      recommendations: (d.recommendations?.results ?? [])
        .slice(0, 12)
        .map((item) => tmdbCard('movie', item as Record<string, unknown>)),
      collection: d.belongs_to_collection
        ? {
            id: d.belongs_to_collection.id,
            name: d.belongs_to_collection.name,
            posterPath: d.belongs_to_collection.poster_path ?? undefined,
            backdropPath: d.belongs_to_collection.backdrop_path ?? undefined,
          }
        : undefined,
    };
  }
  const d = data as z.infer<typeof tmdbTvDetailsSchema>;
  const runtimes = d.episode_run_time ?? [];
  return {
    ...base,
    kind: 'tv',
    title: d.name || d.original_name || 'Untitled',
    originalTitle: d.original_name,
    year: yearOf(d.first_air_date),
    dateLabel: d.first_air_date || undefined,
    runtime: runtimes.length > 0 ? `~${runtimes[0]}m / ep` : undefined,
    seasons: d.number_of_seasons || undefined,
    recommendations: (d.recommendations?.results ?? [])
      .slice(0, 12)
      .map((item) => tmdbCard('tv', item as Record<string, unknown>)),
  };
}

export async function getRail(
  kind: TmdbKind,
  rail: 'trending' | 'topRated' | 'popular',
): Promise<TmdbCard[]> {
  const schema = kind === 'movie' ? tmdbMoviePagedSchema : tmdbTvPagedSchema;
  const path =
    rail === 'trending'
      ? `/trending/${kind}/week`
      : `/${kind}/${rail === 'topRated' ? 'top_rated' : 'popular'}`;
  const params = (
    rail === 'trending' ? { language: 'en-US' as string } : { language: 'en-US', region: 'US' }
  ) as Record<string, string>;
  const data = await tmdbFetch(schema, path, params, { ttlMs: LIST_TTL_MS });
  return data.results.map((item) => tmdbCard(kind, item as Record<string, unknown>));
}

export async function search(query: string): Promise<TmdbCard[]> {
  const params = { language: 'en-US', query };
  const [movies, tvs] = await Promise.all([
    tmdbFetch(tmdbMoviePagedSchema, '/search/movie', params, { ttlMs: LIST_TTL_MS }),
    tmdbFetch(tmdbTvPagedSchema, '/search/tv', params, { ttlMs: LIST_TTL_MS }),
  ]);
  return [
    ...movies.results.map((item) => tmdbCard('movie' as TmdbKind, item as Record<string, unknown>)),
    ...tvs.results.map((item) => tmdbCard('tv' as TmdbKind, item as Record<string, unknown>)),
  ];
}

export async function getCollection(id: number) {
  const data = await tmdbFetch(
    tmdbCollectionSchema,
    `/collection/${id}`,
    { language: 'en-US' },
    { ttlMs: DETAILS_TTL_MS },
  );
  return (data.parts ?? []).map((item) => tmdbCard('movie', item as Record<string, unknown>));
}

function yearOf(date: string | undefined): string | undefined {
  const y = date?.slice(0, 4);
  return y && /^\d{4}$/.test(y) ? y : undefined;
}

function tmdbCard(kind: TmdbKind, item: Record<string, unknown>): TmdbCard {
  const title = kind === 'movie' ? item.title : item.name;
  const originalTitle = kind === 'movie' ? item.original_title : item.original_name;
  const date = kind === 'movie' ? item.release_date : item.first_air_date;
  return {
    kind,
    tmdbId: item.id as number,
    title: (title as string) || (originalTitle as string) || 'Untitled',
    originalTitle: originalTitle as string,
    overview: item.overview as string,
    posterPath: (item.poster_path as string | null | undefined) ?? undefined,
    backdropPath: (item.backdrop_path as string | null | undefined) ?? undefined,
    year: yearOf(date as string),
    rating: item.vote_average as number,
  };
}
