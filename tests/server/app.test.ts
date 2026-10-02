import { describe, expect, it } from 'vitest';
import { app } from '@/server/app';

describe('hono app', () => {
  it('answers the health route under the /api base path', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it('echoes an inbound x-request-id', async () => {
    const res = await app.request('/api/health', {
      headers: { 'x-request-id': 'abc-123' },
    });
    expect(res.headers.get('x-request-id')).toBe('abc-123');
  });

  it('mints an x-request-id when none is sent', async () => {
    const res = await app.request('/api/health');
    expect(res.headers.get('x-request-id')).toBeTruthy();
  });
});
