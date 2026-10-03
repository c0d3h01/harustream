import { Hono } from 'hono';
import { z } from 'zod';
import { AppError } from '@/lib/errors';
import { getCollection, getDetails, getRail, search } from '@/tmdb/catalog';

const kindParam = z.enum(['movie', 'tv']);
const idParam = z.coerce.number().int().positive();

export const tmdbRouter = new Hono();

tmdbRouter.get('/tmdb/detail/:kind/:id', async (c) => {
  const kind = kindParam.safeParse(c.req.param('kind'));
  const id = idParam.safeParse(c.req.param('id'));
  if (!kind.success || !id.success) throw new AppError('BAD_REQUEST', 'Invalid detail params');
  return c.json(await getDetails(kind.data, id.data));
});

tmdbRouter.get('/tmdb/rail/:kind/:rail', async (c) => {
  const kind = kindParam.safeParse(c.req.param('kind'));
  const rail = z.enum(['trending', 'topRated', 'popular']).safeParse(c.req.param('rail'));
  if (!kind.success || !rail.success) throw new AppError('BAD_REQUEST', 'Invalid rail params');
  return c.json(await getRail(kind.data, rail.data));
});

tmdbRouter.get('/tmdb/collection/:id', async (c) => {
  const id = idParam.safeParse(c.req.param('id'));
  if (!id.success) throw new AppError('BAD_REQUEST', 'Invalid collection id');
  return c.json(await getCollection(id.data));
});

tmdbRouter.get('/tmdb/search', async (c) => {
  const parsed = z.object({ q: z.string().min(1) }).safeParse(c.req.query());
  if (!parsed.success) throw new AppError('BAD_REQUEST', 'Invalid search query');
  return c.json(await search(parsed.data.q));
});
