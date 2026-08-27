import { z } from 'zod';
import { AppError } from '@/lib/errors';
import type { ProviderModule } from '@/providers/types';

const textTrack = z.object({
  title: z.string(),
  language: z.string(),
  type: z.enum(['application/x-subrip', 'application/ttml+xml', 'text/vtt']),
  uri: z.string().url(),
});

const skipInterval = z.object({
  title: z.string().optional(),
  from: z.number(),
  to: z.number(),
});

export const rawPostSchema = z.object({
  title: z.string().min(1),
  link: z.string().min(1),
  image: z.string().optional().default(''),
  provider: z.string().optional(),
});

export const rawStreamSchema = z.object({
  server: z.string().min(1),
  link: z.string().min(1),
  type: z.string().min(1),
  quality: z.string().optional(),
  subtitles: z.array(textTrack).optional(),
  headers: z.record(z.string()).optional(),
  skip: z.array(skipInterval).optional(),
});

const rawLinkSource = z.object({
  title: z.string().min(1),
  link: z.string().min(1),
  type: z.enum(['movie', 'series']).optional(),
  description: z.string().optional(),
  image: z.string().optional(),
  quickDownload: z.boolean().optional(),
  skip: z.array(skipInterval).optional(),
});

const rawLink = z.object({
  title: z.string().min(1),
  quality: z.string().optional(),
  episodesLink: z.string().optional(),
  quickDownload: z.boolean().optional(),
  directLinks: z.array(rawLinkSource).optional(),
});

export const rawInfoSchema = z.object({
  title: z.string().min(1),
  image: z.string().optional().default(''),
  poster: z.string().optional(),
  logo: z.string().optional(),
  synopsis: z.string().optional().default(''),
  imdbId: z.string().optional().default(''),
  tmdbId: z.string().optional(),
  type: z.string().min(1),
  tags: z.array(z.string()).optional(),
  cast: z.array(z.string()).optional(),
  rating: z.string().optional(),
  linkList: z.array(rawLink),
  webUrl: z.string().optional(),
});

export const rawEpisodeSchema = z.object({
  title: z.string().min(1),
  link: z.string().min(1),
  description: z.string().optional(),
  image: z.string().optional(),
  quickDownload: z.boolean().optional(),
  skip: z.array(skipInterval).optional(),
});

export function parseRaw<T>(
  schema: z.ZodType<T>,
  value: unknown,
  context: { provider: string; op: string },
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new AppError(
      'INVALID_RESPONSE',
      `${context.provider} ${context.op} returned invalid response: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}

export type RawProviderModule = ProviderModule;
