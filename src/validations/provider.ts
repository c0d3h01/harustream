import { z } from 'zod';

const textTrack = z.object({
  title: z.string(),
  language: z.string(),
  type: z.enum(['application/x-subrip', 'application/ttml+xml', 'text/vtt']),
  uri: z.string().url(),
});
const skipInterval = z.object({ title: z.string().optional(), from: z.number(), to: z.number() });

export const rawPostSchema = z.object({
  title: z.string().min(1),
  link: z.string().min(1),
  image: z.string().optional().default(''),
});
export const rawStreamSchema = z.object({
  server: z.string().min(1),
  link: z.string().min(1),
  type: z.string().min(1),
  quality: z.string().optional(),
  subtitles: z.array(textTrack).optional(),
  skip: z.array(skipInterval).optional(),
});
const rawLinkSource = z.object({
  title: z.string().min(1),
  link: z.string().min(1),
});
const rawLink = z.object({
  title: z.string().min(1),
  episodesLink: z.string().optional(),
  directLinks: z.array(rawLinkSource).optional(),
});
export const rawInfoSchema = z.object({
  title: z.string().min(1),
  image: z.string().optional().default(''),
  poster: z.string().optional(),
  synopsis: z.string().optional().default(''),
  imdbId: z.string().optional().default(''),
  type: z.string().min(1),
  tags: z.array(z.string()).optional(),
  rating: z.string().optional(),
  linkList: z.array(rawLink),
});
export const rawEpisodeSchema = z.object({
  title: z.string().min(1),
  link: z.string().min(1),
  skip: z.array(skipInterval).optional(),
});
