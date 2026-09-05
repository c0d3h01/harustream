import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPopular, getTrending, getWatchProviderList, searchTmdb } from '@/tmdb/catalog';
import { tmdbFetch } from '@/tmdb/client';
import { tmdbImageUrl } from '@/tmdb/images';
import { tmdbLocale } from '@/tmdb/locale';
import { tmdbMoviePagedSchema } from '@/validations/tmdb';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('tmdbLocale', () => {
  it('maps every app locale to a TMDB language and region', () => {
    expect(tmdbLocale('en')).toEqual({ language: 'en-US', region: 'US' });
    expect(tmdbLocale('ja')).toEqual({ language: 'ja-JP', region: 'JP' });
    expect(tmdbLocale('es')).toEqual({ language: 'es-ES', region: 'ES' });
    expect(tmdbLocale('fr')).toEqual({ language: 'fr-FR', region: 'FR' });
    expect(tmdbLocale('de')).toEqual({ language: 'de-DE', region: 'DE' });
    expect(tmdbLocale('hi')).toEqual({ language: 'hi-IN', region: 'IN' });
  });

  it('falls back to en-US/US for unknown locales', () => {
    expect(tmdbLocale('xx')).toEqual({ language: 'en-US', region: 'US' });
  });
});

describe('tmdbImageUrl', () => {
  it('builds sized image.tmdb.org URLs', () => {
    expect(tmdbImageUrl('/abc.jpg', 'w342')).toBe('https://image.tmdb.org/t/p/w342/abc.jpg');
  });

  it('returns undefined for missing paths', () => {
    expect(tmdbImageUrl(null, 'w342')).toBeUndefined();
    expect(tmdbImageUrl(undefined, 'w500')).toBeUndefined();
    expect(tmdbImageUrl('', 'w500')).toBeUndefined();
  });
});

describe('tmdbFetch', () => {
  it('sends the API key and locale params, then parses the schema', async () => {
    vi.stubEnv('TMDB_API_KEY', 'test-key');
    const fetchMock = vi.fn(async (_url: unknown, _init?: unknown) =>
      jsonResponse({ page: 1, results: [{ id: 1, title: 'X' }], total_pages: 1, total_results: 1 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const data = await tmdbFetch(tmdbMoviePagedSchema, '/movie/popular', {
      language: 'en-US',
      region: 'US',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('https://api.themoviedb.org/3/movie/popular');
    expect(url).toContain('api_key=test-key');
    expect(url).toContain('language=en-US');
    expect(data.results[0].id).toBe(1);
  });

  it('throws CONFIG without touching the network when the key is missing', async () => {
    vi.stubEnv('TMDB_API_KEY', '');
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    await expect(tmdbFetch(tmdbMoviePagedSchema, '/movie/popular')).rejects.toMatchObject({
      code: 'CONFIG',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps TMDB status codes to app errors', async () => {
    vi.stubEnv('TMDB_API_KEY', 'test-key');
    for (const [status, code] of [
      [401, 'CONFIG'],
      [404, 'NOT_FOUND'],
      [429, 'UPSTREAM'],
      [500, 'UPSTREAM'],
    ] as const) {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => jsonResponse({}, status)),
      );
      await expect(
        tmdbFetch(tmdbMoviePagedSchema, `/probe-${status}`, {}, { ttlMs: 0 }),
      ).rejects.toMatchObject({ code });
    }
  });

  it('throws INVALID_RESPONSE for shapes that fail validation', async () => {
    vi.stubEnv('TMDB_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ results: [{ nope: true }] })),
    );
    await expect(
      tmdbFetch(tmdbMoviePagedSchema, '/probe-invalid', {}, { ttlMs: 0 }),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('coalesces concurrent identical requests into one fetch', async () => {
    vi.stubEnv('TMDB_API_KEY', 'test-key');
    const fetchMock = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return jsonResponse({ page: 1, results: [], total_pages: 0, total_results: 0 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const params = { language: 'en-US', stamp: 'coalesce-probe' };
    await Promise.all([
      tmdbFetch(tmdbMoviePagedSchema, '/movie/popular', params),
      tmdbFetch(tmdbMoviePagedSchema, '/movie/popular', params),
    ]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe('catalog mapping', () => {
  it('maps trending movies with year and rating fallbacks', async () => {
    vi.stubEnv('TMDB_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          page: 1,
          results: [
            {
              id: 11,
              title: 'Example',
              original_title: 'Example',
              overview: 'Hi',
              poster_path: '/p.jpg',
              backdrop_path: null,
              release_date: '2024-05-01',
              vote_average: 7.5,
              genre_ids: [12],
              popularity: 9,
            },
          ],
          total_pages: 1,
          total_results: 1,
        }),
      ),
    );

    const [card] = await getTrending('en', 'movie');
    expect(card).toMatchObject({
      kind: 'movie',
      tmdbId: 11,
      title: 'Example',
      year: '2024',
      rating: 7.5,
      posterPath: '/p.jpg',
      backdropPath: undefined,
    });
  });

  it('maps trending series titles and first-air years', async () => {
    vi.stubEnv('TMDB_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          page: 1,
          results: [{ id: 7, name: 'Show', first_air_date: '2021-01-01' }],
          total_pages: 1,
          total_results: 1,
        }),
      ),
    );

    const [card] = await getTrending('ja', 'tv');
    expect(card).toMatchObject({ kind: 'tv', tmdbId: 7, title: 'Show', year: '2021' });
  });

  it('filters people out of multi search', async () => {
    vi.stubEnv('TMDB_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          page: 1,
          results: [
            { media_type: 'person', id: 1, name: 'Actor' },
            { media_type: 'movie', id: 2, title: 'Film', release_date: '2020-01-01' },
            { media_type: 'tv', id: 3, name: 'Series', first_air_date: '2019-01-01' },
          ],
          total_pages: 1,
          total_results: 3,
        }),
      ),
    );

    const cards = await searchTmdb('en', 'example');
    expect(cards.map((card) => card.tmdbId)).toEqual([2, 3]);
  });

  it('sorts watch providers by regional priority', async () => {
    vi.stubEnv('TMDB_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          results: [
            { provider_id: 2, provider_name: 'B', display_priorities: { US: 9 } },
            { provider_id: 1, provider_name: 'A', display_priorities: { US: 1 } },
          ],
        }),
      ),
    );

    const providers = await getWatchProviderList('en', 'movie');
    expect(providers.map((provider) => provider.name)).toEqual(['A', 'B']);
  });

  it('passes the locale language to list endpoints', async () => {
    vi.stubEnv('TMDB_API_KEY', 'test-key');
    const fetchMock = vi.fn(async (_url: unknown, _init?: unknown) =>
      jsonResponse({ page: 1, results: [] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await getPopular('hi', 'movie');
    expect(String(fetchMock.mock.calls[0][0])).toContain('language=hi-IN');
  });
});
