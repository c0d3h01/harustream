import { Hono } from 'hono';
import { z } from 'zod';
import { AppError } from '@/lib/errors';
import { resolveTitle } from '@/services/resolve';

const query = z.object({
  title: z.string().min(1),
  originalTitle: z.string().min(1).optional(),
  year: z.string().min(1).optional(),
});

export const resolveRouter = new Hono();

resolveRouter.get('/resolve', async (c) => {
  const parsed = query.safeParse(c.req.query());
  if (!parsed.success) throw new AppError('BAD_REQUEST', 'Invalid resolve query');
  const { title, originalTitle, year } = parsed.data;
  return c.json(await resolveTitle(title, originalTitle, year, c.req.raw.signal));
});
