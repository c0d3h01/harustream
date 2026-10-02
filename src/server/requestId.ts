import type { MiddlewareHandler } from 'hono';

export const requestId: MiddlewareHandler = async (c, next) => {
  c.header('x-request-id', c.req.header('x-request-id') || crypto.randomUUID());
  await next();
};
