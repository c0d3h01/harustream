import { describe, expect, it, vi } from 'vitest';
import { app } from '@/server/app';

vi.mock('@/services/media', () => ({ media: vi.fn() }));
vi.mock('@/services/episodes', () => ({ episodesFor: vi.fn() }));
vi.mock('@/services/sources', () => ({ sources: vi.fn() }));

import { episodesFor } from '@/services/episodes';
import { sources } from '@/services/sources';

describe('GET /api/episodes', () => {
  it('returns the episode array for a known provider', async () => {
    vi.mocked(episodesFor).mockResolvedValue([{ id: 'e1', title: 'Pilot', ref: 'r1' }]);
    const res = await app.request('/api/episodes?provider=movieBoxWeb&ref=movie-1');
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([{ id: 'e1', title: 'Pilot', ref: 'r1' }]);
  });

  it('rejects a missing provider with 400 and a JSON error body', async () => {
    const res = await app.request('/api/episodes?ref=movie-1');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('BAD_REQUEST');
    expect(body.requestId).toBeTruthy();
  });
});

describe('GET /api/sources', () => {
  it('returns variants with minted playback hrefs', async () => {
    vi.mocked(sources).mockResolvedValue([
      {
        providerId: 'movieBoxWeb',
        variantId: 'v1',
        format: 'hls',
        label: 'HD',
        subtitles: [],
        playbackHref: '/api/stream/movieBoxWeb/abc',
      },
    ]);
    const res = await app.request('/api/sources?provider=movieBoxWeb&ref=movie-1');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body[0].playbackHref).toBe('/api/stream/movieBoxWeb/abc');
  });

  it('defaults kind to movie when omitted', async () => {
    vi.mocked(sources).mockResolvedValue([]);
    await app.request('/api/sources?provider=movieBoxWeb&ref=movie-1');
    expect(vi.mocked(sources).mock.calls[0]?.[2]).toBe('movie');
  });

  it('maps a provider failure to 502 (provider exists but failed)', async () => {
    const { ProviderError } = await import('@/lib/errors');
    vi.mocked(sources).mockRejectedValue(new ProviderError('nope'));
    const res = await app.request('/api/sources?provider=movieBoxWeb&ref=x');
    expect(res.status).toBe(502);
  });

  it('rejects an unknown provider id with 404 NOT_FOUND before any service call', async () => {
    vi.mocked(sources).mockClear();
    const res = await app.request('/api/sources?provider=doesNotExist&ref=x');
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe('NOT_FOUND');
    expect(vi.mocked(sources)).not.toHaveBeenCalled();
  });

  it('does not leak upstream detail when a service throws a raw Error', async () => {
    vi.mocked(sources).mockRejectedValue(new Error('ECONNRESET 10.0.0.5:443 secret-host'));
    const res = await app.request('/api/sources?provider=movieBoxWeb&ref=x');
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).not.toContain('secret-host');
    expect(body.code).toBe('UPSTREAM');
  });
});

describe('GET /api/media', () => {
  it('requires provider and ref', async () => {
    const res = await app.request('/api/media?provider=movieBoxWeb');
    expect(res.status).toBe(400);
  });
});
