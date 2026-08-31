import { z } from 'zod';

export const searchQuery = z.object({
  q: z.string().trim().min(1).max(200),
  provider: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/)
    .optional(),
  page: z.coerce.number().int().positive().max(100).default(1),
});

export const catalogQuery = z.object({
  provider: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/),
  filter: z.string().trim().max(100).default(''),
  page: z.coerce.number().int().positive().max(100).default(1),
});

export const providerRefQuery = z.object({
  provider: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/),
  ref: z.string().trim().min(1).max(2048),
});

export const sourcesQuery = providerRefQuery.extend({
  kind: z.string().trim().min(1).default('movie'),
});
