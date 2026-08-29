import type { ProviderContext, RawInfo, RawLink } from '../_shared';
import { providerBaseUrl } from '../_shared';

const BASE_URL = providerBaseUrl('flixhq');

interface FetchMetaArgs {
  link: string;
  signal?: AbortSignal;
  ctx: ProviderContext;
}

export async function getMeta({
  link,
  signal,
  ctx,
}: FetchMetaArgs): Promise<RawInfo> {
  try {
    const { axios } = ctx;
    const url = `${BASE_URL}/info?id=${link}`;
    const res = await axios.get(url, { signal });
    const data = res.data;

    const title = data.title || '';
    const synopsis = data.description?.replace(/<[^>]*>?/gm, '').trim() || '';
    const image = data.cover || '';
    const cast = data.casts || [];
    const rating = data.rating || '';
    const type = data.episodes?.length > 1 ? 'series' : 'movie';

    const tags: string[] = [];
    if (data.type) tags.push(data.type);
    if (data.duration) tags.push(data.duration);
    if (data.releaseDate) tags.push(data.releaseDate.split('-')[0]);

    const links: RawLink['directLinks'] = [];
    data.episodes?.forEach((episode: any) => {
      const epTitle = episode?.number
        ? `Season-${episode?.season} Ep-${episode.number}`
        : episode.title;
      const epLink = episode.id + '*' + data.id;
      if (epLink && epTitle) {
        links.push({ title: epTitle, link: epLink });
      }
    });

    return {
      title,
      synopsis,
      image,
      poster: image,
      cast,
      rating,
      tags,
      type,
      linkList: links.length > 0 ? [{ title: title, directLinks: links }] : [],
      webUrl: link,
    };
  } catch (err) {
    console.error('FlixHQ getMeta error:', err);
    throw err;
  }
}