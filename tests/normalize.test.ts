import { describe, expect, it } from 'vitest';
import {
  displayTitle,
  orderVariants,
  toEpisode,
  toMedia,
  toRawVariant,
  toSearchResult,
} from '@/services/normalize';
import { anikotoHls, movieBoxSeries, moviesmodMovie } from './fixtures/provider-output';

const MEDIA_ID = 'test-media-id';

describe('provider normalization', () => {
  it('derives concise display titles without changing raw titles', () => {
    expect(
      displayTitle(
        'Download Interstellar (2014) Dual Audio {Hindi-English} 480p [650MB] || 720p [1.5GB]',
      ),
    ).toBe('Interstellar (2014)');
    expect(
      displayTitle(
        'Download Breaking Bad (Season 1 – 5) Dual Audio {Hindi-English} BluRay 480p [200MB]',
      ),
    ).toBe('Breaking Bad (Season 1 – 5)');
    expect(displayTitle('Breaking Bad S1-S5')).toBe('Breaking Bad S1-S5');
    expect(displayTitle('Sinbad: Night at High Noon and the Wonder Gate')).toBe(
      'Sinbad: Night at High Noon and the Wonder Gate',
    );
  });

  it('normalizes a provider post fixture', () => {
    const result = toSearchResult(
      { title: 'Interstellar', link: '/movie/interstellar', image: 'https://img.test/i.jpg' },
      'Moviesmod',
      'MoviesMod',
    );
    expect(result).toMatchObject({
      providerId: 'Moviesmod',
      title: 'Interstellar',
      ref: '/movie/interstellar',
      posterUrl: 'https://img.test/i.jpg',
    });
    expect(result.id).toMatch(/^Moviesmod:/);
  });

  it('keeps opaque references and media groups', () => {
    const result = toMedia(
      {
        title: 'Example',
        image: 'https://img.test/a.jpg',
        synopsis: 'Summary',
        imdbId: '',
        type: 'series',
        linkList: [
          {
            title: 'English',
            episodesLink: '{"subjectId":"opaque"}',
          },
        ],
      },
      'movieBoxWeb',
      '/moviesDetail/example',
    );
    expect(result.kind).toBe('series');
    expect(result.groups[0]).toMatchObject({
      kind: 'episodes',
      ref: '{"subjectId":"opaque"}',
      items: [],
    });
  });

  it('detects formats despite query strings and provider type', () => {
    expect(
      toRawVariant(
        { server: 'a', link: 'https://cdn.test/master.m3u8?x=1', type: 'mp4' },
        'anikoto',
        MEDIA_ID,
      ).format,
    ).toBe('hls');
    expect(
      toRawVariant(
        { server: 'b', link: 'https://cdn.test/file/x?download', type: 'mkv' },
        'Moviesmod',
        MEDIA_ID,
      ).format,
    ).toBe('mkv');
    expect(
      toRawVariant(
        { server: 'b', link: 'https://cdn.test/video.mkv', type: 'other' },
        'Moviesmod',
        MEDIA_ID,
      ).format,
    ).toBe('mkv');
    expect(
      toRawVariant(
        { server: 'c', link: 'https://cdn.test/file?sign=abc&t=123', type: 'mp4' },
        'movieBoxWeb',
        MEDIA_ID,
      ).format,
    ).toBe('mp4');
    expect(
      toRawVariant(
        { server: 'd', link: 'https://api.test/play.mpd?q=x', type: 'DASH' },
        'x',
        MEDIA_ID,
      ).format,
    ).toBe('mpd');
  });

  it('orders HLS first, then DASH, then quality descending', () => {
    const variants = [
      toRawVariant(
        { server: '720', link: 'https://a.test/a.mp4', type: 'mp4', quality: '720' },
        'x',
        MEDIA_ID,
      ),
      toRawVariant(
        { server: '1080', link: 'https://a.test/b.mp4', type: 'mp4', quality: '1080' },
        'x',
        MEDIA_ID,
      ),
      toRawVariant(
        { server: 'dash', link: 'https://a.test/d.mpd', type: 'dash', quality: '480' },
        'x',
        MEDIA_ID,
      ),
      toRawVariant(
        { server: 'hls', link: 'https://a.test/c.m3u8', type: 'm3u8', quality: '480' },
        'x',
        MEDIA_ID,
      ),
    ];
    expect(orderVariants(variants).map((variant) => variant.label)).toEqual([
      'hls',
      'dash',
      '1080',
      '720',
    ]);
  });

  it('keeps variant ids stable across provider re-scrapes, even when the token lives in the URL path', () => {
    // vega/anikoto mint a fresh session token INSIDE the path itself, not
    // just the query — so identity must come from what the provider
    // declares about the stream (format + quality + server), not its URL.
    const first = toRawVariant(
      { server: 'c', link: 'https://bcdn.test/resource/abc123.mp4?sign=aaa&t=111', type: 'mp4' },
      'movieBoxWeb',
      MEDIA_ID,
    );
    const remintedQuery = toRawVariant(
      { server: 'c', link: 'https://bcdn.test/resource/abc123.mp4?sign=bbb&t=222', type: 'mp4' },
      'movieBoxWeb',
      MEDIA_ID,
    );
    const rotatedPathToken = toRawVariant(
      { server: 'c', link: 'https://bcdn.test/resource/other456.mp4?sign=ccc&t=333', type: 'mp4' },
      'movieBoxWeb',
      MEDIA_ID,
    );
    expect(remintedQuery.variantId).toBe(first.variantId);
    expect(rotatedPathToken.variantId).toBe(first.variantId);
    expect(first.providerId).toBe('movieBoxWeb');
    // A different server label is a genuinely different stream.
    expect(
      toRawVariant(
        { server: 'd', link: 'https://bcdn.test/resource/abc123.mp4?sign=aaa&t=111', type: 'mp4' },
        'movieBoxWeb',
        MEDIA_ID,
      ).variantId,
    ).not.toBe(first.variantId);
  });

  it('disambiguates same-label variants deterministically by their canonical sort order', () => {
    // Torrentio reports every result under the same 'Torrentio' server name;
    // two identical-quality entries must still get distinct, stable ids.
    const a = toRawVariant(
      { server: 'Torrentio', link: 'https://cdn.test/a.mp4', type: 'mp4', quality: '1080' },
      'torrentio',
      MEDIA_ID,
    );
    const b = toRawVariant(
      { server: 'Torrentio', link: 'https://cdn.test/b.mp4', type: 'mp4', quality: '1080' },
      'torrentio',
      MEDIA_ID,
    );
    const [first, second] = orderVariants([a, b]);
    expect(first.variantId).not.toBe(second.variantId);
    // Re-running on a freshly re-scraped (but same-order) list yields the
    // same ids — this is what lets a stale variantId still resolve after a
    // cold-instance re-resolution.
    const [firstAgain, secondAgain] = orderVariants([{ ...a }, { ...b }]);
    expect(firstAgain.variantId).toBe(first.variantId);
    expect(secondAgain.variantId).toBe(second.variantId);
  });

  it('normalizes captured Moviesmod direct links', () => {
    const result = toMedia(moviesmodMovie, 'Moviesmod', moviesmodMovie.webUrl ?? '');
    expect(result).toMatchObject({
      title: 'Interstellar',
      kind: 'movie',
      groups: [
        {
          kind: 'direct',
          quality: '720p',
          items: [{ label: 'Movie', kind: 'movie' }],
        },
      ],
    });
  });

  it('normalizes captured MovieBox episode links', () => {
    const result = toMedia(movieBoxSeries, 'movieBoxWeb', movieBoxSeries.webUrl ?? '');
    expect(result).toMatchObject({
      title: 'Breaking Bad S1-S5',
      kind: 'series',
      groups: [{ kind: 'episodes', items: [], ref: movieBoxSeries.linkList[0].episodesLink }],
    });
  });

  it('normalizes captured Anikoto HLS subtitles', () => {
    const result = toRawVariant(anikotoHls, 'anikoto', MEDIA_ID);
    expect(result).toMatchObject({
      format: 'hls',
      quality: '1080p',
      subtitles: [
        { language: 'en', format: 'vtt' },
        { language: 'fr', format: 'vtt' },
      ],
    });
  });

  it('parses season and episode numbers from real provider titles', () => {
    expect(toEpisode({ title: 'S01 E01', link: 'episode-1' }, 'movieBoxWeb')).toMatchObject({
      season: 1,
      number: 1,
    });
    expect(toEpisode({ title: 'Episode 7', link: 'episode-7' }, 'movieBoxWeb', 2)).toMatchObject({
      season: 2,
      number: 7,
    });
  });
});
