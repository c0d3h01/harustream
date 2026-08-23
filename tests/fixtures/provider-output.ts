import type { RawInfo, RawStream } from '@/providers/types';

export const moviesmodMovie: RawInfo = {
  title: 'Interstellar',
  image: 'https://image.tmdb.org/t/p/w185/yQvGrMoipbRoddT0ZR8tPoR7NfX.jpg',
  synopsis: 'The adventures of a group of explorers who travel through a wormhole.',
  imdbId: 'tt0816692',
  type: 'movie',
  linkList: [
    {
      title: 'Interstellar (2014) Hindi-English 720p [1.5GB]',
      quality: '720p',
      directLinks: [
        {
          title: 'Movie',
          link: 'https://links.modpro.blog/archives/90390',
          type: 'movie',
        },
      ],
    },
  ],
  webUrl: 'https://moviesmod.zone/download-interstellar-2014-hindi-480p-720p-1080p/',
};

export const movieBoxSeries: RawInfo = {
  title: 'Breaking Bad S1-S5',
  image: 'https://pbcdnw.aoneroom.com/image/2026/03/30/bbe3def74e939ed9bd94d2b4f213023b.jpg',
  synopsis: 'A chemistry teacher turns to manufacturing methamphetamine.',
  rating: '9.5',
  tags: ['United States', '2008', 'Crime', 'Drama'],
  type: 'series',
  linkList: [
    {
      title: 'Original Audio',
      episodesLink:
        '{"subjectId":"6207982430134357800","detailPath":"breaking-bad-ej6Bp0MCAo7","language":"Original Audio"}',
    },
  ],
  webUrl: 'https://themoviebox.org/moviesDetail/breaking-bad-ej6Bp0MCAo7',
};

export const anikotoHls: RawStream = {
  server: 'Vidstream-2 (SUB)',
  link: 'https://cdn.watching.onl/anime/82cec96096d4281b7c95cd7e74623496/index-f1-v1-a1.m3u8',
  type: 'hls',
  quality: '1080p',
  headers: {
    Referer: 'https://megaplay.buzz/',
    Origin: 'https://megaplay.buzz',
  },
  subtitles: [
    {
      title: 'English',
      language: 'en',
      uri: 'https://worker.zendax.me/api/fetch?url=https%3A%2F%2Fcdn.watching.onl%2Fsubtitles%2Feng-2.vtt',
      type: 'text/vtt',
    },
    {
      title: 'Français',
      language: 'fr',
      uri: 'https://worker.zendax.me/api/fetch?url=https%3A%2F%2Fcdn.watching.onl%2Fsubtitles%2Ffra-1.vtt',
      type: 'text/vtt',
    },
  ],
};
