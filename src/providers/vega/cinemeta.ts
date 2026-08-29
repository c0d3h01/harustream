import type { Info, ProviderContext } from '../_shared';

export interface CinemetaMeta {
  name?: string;
  background?: string;
  poster?: string;
  logo?: string;
  description?: string;
  imdb_id?: string;
  moviedb_id?: number;
  type?: string;
  genres?: string[];
  genre?: string[];
  cast?: string[];
  imdbRating?: string;
  videos?: CinemetaVideo[];
}

export interface CinemetaVideo {
  season?: number;
  episode?: number;
  title?: string;
  overview?: string;
  still?: string;
  runtime?: number;
  air_date?: string;
}

export async function getCinemetaMeta(
  imdbId: string,
  type: string,
  providerContext: ProviderContext,
): Promise<CinemetaMeta> {
  try {
    const { axios } = providerContext;
    const url = `https://v3-cinemeta.strem.io/meta/${type}/${imdbId}.json`;
    const response = await axios.get(url);
    return response.data?.meta || {};
  } catch {
    return {};
  }
}

export function addCinemetaContext(url: string, imdbId: string, season: number): string {
  try {
    const urlObj = new URL(url);
    urlObj.searchParams.set('imdbId', imdbId);
    urlObj.searchParams.set('season', season.toString());
    return urlObj.toString();
  } catch {
    return url;
  }
}

export function getCinemetaSeason(title: string): number | null {
  const match = title.match(/season\s*(\d+)/i) || title.match(/s(\d{1,2})\s*e\d{1,3}/i);
  return match ? parseInt(match[1], 10) : null;
}

export function readCinemetaContext(url: string): {
  imdbId: string;
  season: number;
  requestUrl: string;
} {
  try {
    const urlObj = new URL(url);
    const imdbId = urlObj.searchParams.get('imdbId') || '';
    const season = parseInt(urlObj.searchParams.get('season') || '0', 10);
    // Remove the cinemeta params for the actual request
    urlObj.searchParams.delete('imdbId');
    urlObj.searchParams.delete('season');
    const requestUrl = urlObj.toString();
    return { imdbId, season, requestUrl };
  } catch {
    return { imdbId: '', season: 0, requestUrl: url };
  }
}

export function enrichCinemetaEpisodes(
  episodes: { title: string; link: string }[],
  cinemetaVideos: CinemetaVideo[],
  season: number,
): { title: string; link: string; description?: string; image?: string; airDate?: string }[] {
  const seasonEpisodes = cinemetaVideos.filter((v) => v.season === season);
  return episodes.map((ep) => {
    const epNumMatch = ep.title.match(/episode\s*(\d+)/i) || ep.title.match(/e(\d+)/i);
    const epNum = epNumMatch ? parseInt(epNumMatch[1], 10) : null;
    const cinemetaEp = epNum ? seasonEpisodes.find((v) => v.episode === epNum) : null;
    return {
      ...ep,
      description: cinemetaEp?.overview,
      image: cinemetaEp?.still,
      airDate: cinemetaEp?.air_date,
    };
  });
}