import assert from 'node:assert/strict';
import { describe, expect, it } from 'vitest';
import { getCollection, getRail, search } from '@/tmdb/catalog';
import { tmdbFetch } from '@/tmdb/client';
import { tmdbImageUrl } from '@/tmdb/images';
import { tmdbMoviePagedSchema } from '@/validations/tmdb';
import { stubEnv, stubFetch } from '../helpers';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('tmdbImageUrl', () => {
  it('builds sized image.tmdb.org URLs', () => {
    assert.strictEqual(tmdbImageUrl('/abc.jpg', 'w342'), 'https://image.tmdb.org/t/p/w342/abc.jpg');
  });

  it('returns undefined for missing paths', () => {
    assert.strictEqual(tmdbImageUrl(null, 'w342'), undefined);
    assert.strictEqual(tmdbImageUrl(undefined, 'w500'), undefined);
    assert.strictEqual(tmdbImageUrl('', 'w500'), undefined);
  });
});

describe('tmdbFetch', () => {
  it('sends the API key and locale params, then parses the schema', async () => {
    stubEnv('TMDB_API_KEY', 'test-key');
    const { calls } = stubFetch(async () =>
      jsonResponse({ page: 1, results: [{ id: 1, title: 'X' }], total_pages: 1, total_results: 1 }),
    );

    const data = await tmdbFetch(tmdbMoviePagedSchema, '/movie/popular', {
      language: 'en-US',
      region: 'US',
    });

    assert.strictEqual(calls.length, 1);
    const url = String(calls[0][0]);
    assert.ok(url.includes('https://api.themoviedb.org/3/movie/popular'));
    assert.ok(url.includes('api_key=test-key'));
    assert.ok(url.includes('language=en-US'));
    assert.strictEqual(data.results[0].id, 1);
  });

  it('throws CONFIG without touching the network when the key is missing', async () => {
    stubEnv('TMDB_API_KEY', '');
    const { calls } = stubFetch(async () => jsonResponse({}));

    await expect(tmdbFetch(tmdbMoviePagedSchema, '/movie/popular')).rejects.toMatchObject({
      code: 'CONFIG',
    });
    assert.strictEqual(calls.length, 0);
  });

  it('maps TMDB status codes to app errors', async () => {
    stubEnv('TMDB_API_KEY', 'test-key');
    let next = { body: {}, status: 401 };
    stubFetch(async () => jsonResponse(next.body, next.status));
    for (const [status, code] of [
      [401, 'CONFIG'],
      [404, 'NOT_FOUND'],
      [429, 'UPSTREAM'],
      [500, 'UPSTREAM'],
    ] as const) {
      next = { body: {}, status };
      await expect(
        tmdbFetch(tmdbMoviePagedSchema, `/probe-${status}`, {}, { ttlMs: 0 }),
      ).rejects.toMatchObject({ code });
    }
  });

  it('throws INVALID_RESPONSE for shapes that fail validation', async () => {
    stubEnv('TMDB_API_KEY', 'test-key');
    stubFetch(async () => jsonResponse({ results: [{ nope: true }] }));
    await expect(
      tmdbFetch(tmdbMoviePagedSchema, '/probe-invalid', {}, { ttlMs: 0 }),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('coalesces concurrent identical requests into one fetch', async () => {
    stubEnv('TMDB_API_KEY', 'test-key');
    const { calls } = stubFetch(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return jsonResponse({ page: 1, results: [], total_pages: 0, total_results: 0 });
    });

    const params = { language: 'en-US', stamp: 'coalesce-probe' };
    await Promise.all([
      tmdbFetch(tmdbMoviePagedSchema, '/movie/now_playing', params),
      tmdbFetch(tmdbMoviePagedSchema, '/movie/now_playing', params),
    ]);
    assert.strictEqual(calls.length, 1);
  });
});

describe('catalog mapping', () => {
  it('maps trending movies with year and rating fallbacks', async () => {
    stubEnv('TMDB_API_KEY', 'test-key');
    stubFetch(async () =>
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
    );

    const [card] = await getRail('movie', 'trending');
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
    stubEnv('TMDB_API_KEY', 'test-key');
    stubFetch(async () =>
      jsonResponse({
        page: 1,
        results: [{ id: 7, name: 'Show', first_air_date: '2021-01-01' }],
        total_pages: 1,
        total_results: 1,
      }),
    );

    const [card] = await getRail('tv', 'trending');
    expect(card).toMatchObject({ kind: 'tv', tmdbId: 7, title: 'Show', year: '2021' });
  });

  it('returns collection parts directly', async () => {
    stubEnv('TMDB_API_KEY', 'test-key');
    stubFetch(async () =>
      jsonResponse({
        id: 1,
        name: 'Collection',
        overview: '',
        parts: [{ id: 2, title: 'Part', original_title: 'Part', overview: '', vote_average: 7 }],
      }),
    );

    const parts = await getCollection(1);
    assert.deepStrictEqual(
      parts.map((part) => part.tmdbId),
      [2],
    );
  });

  it('caches per query, not per path — different queries must not share results', async () => {
    stubEnv('TMDB_API_KEY', 'test-key');
    const { calls } = stubFetch(async (url) => {
      const u = String(url);
      const isAlpha = u.includes('query=alpha');
      const item = u.includes('/search/movie')
        ? { id: isAlpha ? 101 : 102, title: isAlpha ? 'Alpha Film' : 'Beta Film' }
        : { id: isAlpha ? 201 : 202, name: isAlpha ? 'Alpha Show' : 'Beta Show' };
      return jsonResponse({ page: 1, results: [item], total_pages: 1, total_results: 1 });
    });

    const alpha = await search('alpha');
    const beta = await search('beta');

    assert.strictEqual(calls.length, 4);
    assert.notDeepStrictEqual(
      alpha.map((c) => c.tmdbId),
      beta.map((c) => c.tmdbId),
    );
  });

  it('passes en-US to list endpoints', async () => {
    stubEnv('TMDB_API_KEY', 'test-key');
    const { calls } = stubFetch(async () => jsonResponse({ page: 1, results: [] }));

    await getRail('movie', 'topRated');
    assert.ok(String(calls[0][0]).includes('language=en-US'));
  });
});
