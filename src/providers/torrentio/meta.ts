import type { ProviderContext, RawInfo, RawLink } from '../_shared';
import { providerBaseUrl } from '../_shared';

const BASE_URL = providerBaseUrl('torrentio');

interface FetchMetaArgs {
  link: string;
  signal?: AbortSignal;
  ctx: ProviderContext;
}

export async function getMeta({ link, signal, ctx }: FetchMetaArgs): Promise<RawInfo> {
  const { axios } = ctx;
  // link is the TMDB ID
  const isSeries = link.includes(':') ? link.split(':')[0] === 'tv' : false;
  const tmdbId = link.includes(':') ? link.split(':')[1] : link;
  const mediaType = isSeries ? 'tv' : 'movie';

  const url = `${BASE_URL}/${mediaType}/${tmdbId}`;
  const res = await axios.get(url, { signal });
  const data = res.data;

  const title = data.name || data.title || '';
  const synopsis = data.overview || '';
  const image = data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : '';
  const type = isSeries ? 'series' : 'movie';
  const rating = data.vote_average ? data.vote_average.toString() : '';

  const tags: string[] = [];
  data.genres?.forEach((g: any) => {
    tags.push(g.name);
  });
  if (data.first_air_date) tags.push(data.first_air_date.split('-')[0]);
  if (data.release_date) tags.push(data.release_date.split('-')[0]);

  const linkList: RawLink[] = [];

  if (isSeries && data.episodes) {
    const seasonLinks: RawLink['directLinks'] = [];
    data.episodes.forEach((ep: any) => {
      if (ep.id) {
        seasonLinks.push({
          title: `S${String(ep.season_number).padStart(2, '0')}E${String(ep.episode_number).padStart(2, '0')} - ${ep.name}`,
          link: `tv:${tmdbId}:${ep.season_number}:${ep.episode_number}`,
        });
      }
    });
    if (seasonLinks.length > 0) {
      linkList.push({ title: title, directLinks: seasonLinks });
    }
  } else {
    linkList.push({
      title: title,
      directLinks: [{ title: title, link: `movie:${tmdbId}` }],
    });
  }

  return {
    title,
    synopsis,
    image,
    poster: image,
    tags,
    type,
    rating,
    linkList,
    webUrl: link,
  };
}
