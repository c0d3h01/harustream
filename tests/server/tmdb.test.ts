import { describe, expect, it, vi } from 'vitest';
import { app } from '@/server/app';

vi.mock('@/tmdb/catalog', () => ({
  getDetails: vi.fn(),
  getRail: vi.fn(),
  getCollection: vi.fn(),
  search: vi.fn(),
}));

import { getCollection, getDetails, getRail, search } from '@/tmdb/catalog';

describe('GET /api/tmdb/detail/:kind/:id', () => {
  it('rejects an unknown kind with 400', async () => {
    const res = await app.request('/api/tmdb/detail/book/1');
    expect(res.status).toBe(400);
  });

  it('rejects a non-numeric id with 400', async () => {
    const res = await app.request('/api/tmdb/detail/movie/abc');
    expect(res.status).toBe(400);
  });

  it('returns details for a valid kind and id', async () => {
    vi.mocked(getDetails).mockResolvedValue({ kind: 'movie', tmdbId: 1 } as never);
    const res = await app.request('/api/tmdb/detail/movie/1');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tmdbId).toBe(1);
  });
});

describe('GET /api/tmdb/rail/:kind/:rail', () => {
  it('rejects an unknown kind with 400', async () => {
    const res = await app.request('/api/tmdb/rail/book/trending');
    expect(res.status).toBe(400);
  });

  it('returns cards for a valid kind and rail', async () => {
    vi.mocked(getRail).mockResolvedValue([{ tmdbId: 2 }] as never);
    const res = await app.request('/api/tmdb/rail/tv/trending');
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([{ tmdbId: 2 }]);
  });
});

describe('GET /api/tmdb/collection/:id', () => {
  it('rejects a non-numeric id with 400', async () => {
    const res = await app.request('/api/tmdb/collection/abc');
    expect(res.status).toBe(400);
  });

  it('returns collection cards', async () => {
    vi.mocked(getCollection).mockResolvedValue([{ tmdbId: 3 }] as never);
    const res = await app.request('/api/tmdb/collection/10');
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([{ tmdbId: 3 }]);
  });
});

describe('GET /api/tmdb/search', () => {
  it('rejects an empty search query with 400', async () => {
    const res = await app.request('/api/tmdb/search?q=');
    expect(res.status).toBe(400);
  });

  it('rejects a missing query with 400', async () => {
    const res = await app.request('/api/tmdb/search');
    expect(res.status).toBe(400);
  });

  it('returns cards for a query', async () => {
    vi.mocked(search).mockResolvedValue([{ tmdbId: 4 }] as never);
    const res = await app.request('/api/tmdb/search?q=dune');
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([{ tmdbId: 4 }]);
    expect(vi.mocked(search).mock.calls[0]?.[0]).toBe('dune');
  });
});
