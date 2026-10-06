import * as cheerio from 'cheerio';
import type { RawInfo, RawLink } from '../_shared';
import { throwProviderError } from '../_shared';
import type { MovieBoxDub, MovieBoxResource, MovieBoxSubject } from './utils';
import { BASE_URL, detailPath, parseNuxtDetail } from './utils';

function buildPlaybackLink(
  subject: MovieBoxSubject,
  dub: MovieBoxDub,
  seasons: MovieBoxResource['seasons'],
): string {
  const movieSeason = seasons?.find((season) => season.se === 0) || seasons?.[0];
  const movieResolution = movieSeason?.resolutions
    ?.filter((item) => (item.epNum || 0) >= 1)
    .sort((a, b) => (b.resolution || 0) - (a.resolution || 0))[0]?.resolution;
  return JSON.stringify({
    subjectId: dub.subjectId || subject.subjectId || '',
    detailPath: dub.detailPath || subject.detailPath || '',
    language: dub.lanName || dub.lanCode || 'Original',
    season: subject.subjectType === 2 ? undefined : movieSeason?.se || 0,
    episode: subject.subjectType === 2 ? undefined : 1,
    resolution: subject.subjectType === 2 ? undefined : movieResolution,
    seasons,
  });
}

export const getMeta = async ({
  link,
  signal,
}: {
  link: string;
  signal?: AbortSignal;
}): Promise<RawInfo> => {
  try {
    const pageUrl = new URL(`/moviesDetail/${detailPath(link)}`, `${BASE_URL}/`).toString();
    const response = await fetch(pageUrl, { signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText} | URL ${pageUrl}`);
    }

    const detail = parseNuxtDetail(await response.text(), cheerio);
    if (!detail) throw new Error('MovieBox Web detail data was not found');

    const { subject, resource } = detail;
    const isSeries = subject.subjectType === 2;
    const dubs = subject.dubs?.length
      ? subject.dubs
      : [
          {
            subjectId: subject.subjectId,
            detailPath: subject.detailPath,
            lanName: 'Original',
          },
        ];
    const linkList: RawLink[] = (subject.hasResource === false ? [] : dubs)
      .filter((dub) => dub.subjectId && (dub.detailPath || subject.detailPath))
      .map((dub) => {
        const playbackLink = buildPlaybackLink(subject, dub, resource.seasons);
        if (isSeries) {
          return {
            title: dub.lanName || dub.lanCode || 'Original',
            episodesLink: playbackLink,
          };
        }
        return {
          title: dub.lanName || dub.lanCode || 'Original',
          directLinks: [
            {
              title: dub.lanName || dub.lanCode || 'Original',
              link: playbackLink,
              type: 'movie',
            },
          ],
        };
      });

    const tags = [
      subject.countryName,
      subject.releaseDate?.slice(0, 4),
      ...(subject.genre || '').split(',').map((tag) => tag.trim()),
    ].filter((tag): tag is string => Boolean(tag));

    return {
      title: subject.title || '',
      image: subject.cover?.url || '',
      synopsis: subject.description || '',
      imdbId: '',
      type: isSeries ? 'series' : 'movie',
      tags,
      rating: subject.imdbRatingValue || '',
      linkList,
    };
  } catch (error) {
    throwProviderError('MovieBox Web', 'metadata', error);
  }
};
