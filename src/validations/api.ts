import { z } from 'zod';

export const searchQuery = z.object({
  q: z.string().trim().min(1),
  provider: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().positive().default(1),
});

export const catalogQuery = z.object({
  provider: z.string().trim().min(1),
  filter: z.string().default(''),
  page: z.coerce.number().int().positive().default(1),
});

export const providerRefQuery = z.object({
  provider: z.string().trim().min(1),
  ref: z.string().trim().min(1),
});

export const sourcesQuery = providerRefQuery.extend({
  kind: z.string().trim().min(1).default('movie'),
});
