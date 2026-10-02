import { Hono } from 'hono';
import { requestId } from './requestId';
import { health } from './routers/health';
import { mediaRouter } from './routers/media';

// Next hands Hono the full request URL, so the base path must include /api.
export const app = new Hono().basePath('/api').use(requestId);
app.route('/', health);
app.route('/', mediaRouter);
