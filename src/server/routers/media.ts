import { Hono } from 'hono';
import { z } from 'zod';
import { AppError } from '@/lib/errors';
import { episodesFor } from '@/services/episodes';
import { media } from '@/services/media';
import { sources } from '@/services/sources';

const providerRef = z.object({
  provider: z.string().min(1),
  ref: z.string().min(1),
});
const sourcesQuery = providerRef.extend({ kind: z.string().min(1).default('movie') });

export const mediaRouter = new Hono();

mediaRouter.get('/media', async (c) => {
  const parsed = providerRef.safeParse(c.req.query());
  if (!parsed.success) throw new AppError('BAD_REQUEST', 'Invalid media query');
  const { provider, ref } = parsed.data;
  return c.json(await media(provider, ref, c.req.raw.signal));
});

mediaRouter.get('/episodes', async (c) => {
  const parsed = providerRef.safeParse(c.req.query());
  if (!parsed.success) throw new AppError('BAD_REQUEST', 'Invalid episodes query');
  const { provider, ref } = parsed.data;
  // episodesFor takes a whole Media, not (provider, ref): resolve it first.
  const item = await media(provider, ref, c.req.raw.signal);
  return c.json(await episodesFor(item, c.req.raw.signal));
});

mediaRouter.get('/sources', async (c) => {
  const parsed = sourcesQuery.safeParse(c.req.query());
  if (!parsed.success) throw new AppError('BAD_REQUEST', 'Invalid sources query');
  const { provider, ref, kind } = parsed.data;
  return c.json(await sources(provider, ref, kind, c.req.raw.signal));
});
