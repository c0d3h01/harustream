import { describe, expect, it } from 'vitest';
import {
  displayTitle,
  orderSources,
  toEpisode,
  toMedia,
  toSearchResult,
  toStreamSource,
} from '@/services/normalize';
import { anikotoHls, movieBoxSeries, moviesmodMovie } from './fixtures/provider-output';

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
      toStreamSource(
        { server: 'a', link: 'https://cdn.test/master.m3u8?x=1', type: 'mp4' },
        'anikoto',
      ).format,
    ).toBe('hls');
    expect(
      toStreamSource(
        { server: 'b', link: 'https://cdn.test/file/x?download', type: 'mkv' },
        'Moviesmod',
      ).format,
    ).toBe('mkv');
    expect(
      toStreamSource(
        { server: 'b', link: 'https://cdn.test/video.mkv', type: 'other' },
        'Moviesmod',
      ).format,
    ).toBe('mkv');
    expect(
      toStreamSource(
        { server: 'c', link: 'https://cdn.test/file?sign=abc&t=123', type: 'mp4' },
        'movieBoxWeb',
      ).format,
    ).toBe('mp4');
    expect(
      toStreamSource({ server: 'd', link: 'https://api.test/play.mpd?q=x', type: 'DASH' }, 'x')
        .format,
    ).toBe('mpd');
  });

  it('orders HLS first, then DASH, then quality descending', () => {
    const sources = [
      toStreamSource(
        { server: '720', link: 'https://a.test/a.mp4', type: 'mp4', quality: '720' },
        'x',
      ),
      toStreamSource(
        { server: '1080', link: 'https://a.test/b.mp4', type: 'mp4', quality: '1080' },
        'x',
      ),
      toStreamSource(
        { server: 'dash', link: 'https://a.test/d.mpd', type: 'dash', quality: '480' },
        'x',
      ),
      toStreamSource(
        { server: 'hls', link: 'https://a.test/c.m3u8', type: 'm3u8', quality: '480' },
        'x',
      ),
    ];
    expect(orderSources(sources).map((source) => source.label)).toEqual([
      'hls',
      'dash',
      '1080',
      '720',
    ]);
  });

  it('keeps stream source ids stable across provider signature re-mints', () => {
    const first = toStreamSource(
      { server: 'c', link: 'https://bcdn.test/resource/abc123.mp4?sign=aaa&t=111', type: 'mp4' },
      'movieBoxWeb',
    );
    const reminted = toStreamSource(
      { server: 'c', link: 'https://bcdn.test/resource/abc123.mp4?sign=bbb&t=222', type: 'mp4' },
      'movieBoxWeb',
    );
    const otherHost = toStreamSource(
      { server: 'c', link: 'https://xbcdn.test/resource/abc123.mp4?sign=ccc&t=333', type: 'mp4' },
      'movieBoxWeb',
    );
    expect(reminted.id).toBe(first.id);
    expect(otherHost.id).toBe(first.id);
    expect(first.id).toMatch(/^movieBoxWeb:/);
    expect(
      toStreamSource(
        {
          server: 'c',
          link: 'https://bcdn.test/resource/other456.mp4?sign=aaa&t=111',
          type: 'mp4',
        },
        'movieBoxWeb',
      ).id,
    ).not.toBe(first.id);
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
    const result = toStreamSource(anikotoHls, 'anikoto');
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
