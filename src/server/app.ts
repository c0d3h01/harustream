import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { errorResponseBody, httpStatusForError } from '@/lib/errors';
import { requestId, type Variables } from './requestId';
import { health } from './routers/health';
import { mediaRouter } from './routers/media';

// Next hands Hono the full request URL, so the base path must include /api.
export const app = new Hono<{ Variables: Variables }>().basePath('/api').use(requestId);

app.onError((error, c) => {
  const id = c.get('requestId') ?? c.req.header('x-request-id') ?? 'unknown';
  return c.json(errorResponseBody(error, id), httpStatusForError(error) as ContentfulStatusCode);
});

app.notFound((c) => c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404));

app.route('/', health);
app.route('/', mediaRouter);
