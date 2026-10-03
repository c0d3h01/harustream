import { describe, expect, it, vi } from 'vitest';
import { app } from '@/server/app';

vi.mock('@/services/resolve', () => ({ resolveTitle: vi.fn() }));

import { resolveTitle } from '@/services/resolve';

describe('GET /api/resolve', () => {
  it('requires a title', async () => {
    const res = await app.request('/api/resolve');
    expect(res.status).toBe(400);
  });

  it('rejects an empty title with 400', async () => {
    const res = await app.request('/api/resolve?title=');
    expect(res.status).toBe(400);
  });

  it('returns best and candidates for a title', async () => {
    vi.mocked(resolveTitle).mockResolvedValue({ best: null, candidates: [] });
    const res = await app.request('/api/resolve?title=Example');
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ best: null, candidates: [] });
  });

  it('passes title, originalTitle, and year through', async () => {
    vi.mocked(resolveTitle).mockResolvedValue({ best: null, candidates: [] });
    await app.request('/api/resolve?title=Example&originalTitle=Ex&year=2020');
    expect(vi.mocked(resolveTitle).mock.calls[0]?.slice(0, 3)).toEqual(['Example', 'Ex', '2020']);
  });
});
