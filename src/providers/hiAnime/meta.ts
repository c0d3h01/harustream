import type { ProviderContext, RawInfo, RawLink } from '../_shared';
import { providerBaseUrl } from '../_shared';

const BASE_URL = providerBaseUrl('hiAnime');

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
    const url = `${BASE_URL}/anime/zoro/info?id=${link}`;
    const res = await axios.get(url, { signal });
    const data = res.data;

    const title = data.title || '';
    const synopsis = data.description || '';
    const image = data.image || '';
    const type = data.episodes?.length > 0 ? 'series' : 'movie';

    const tags: string[] = [];
    if (data.type) tags.push(data.type);
    if (data.subOrDub) {
      tags.push(data.subOrDub === 'both' ? 'Sub And Dub' : data.subOrDub);
    }

    const linkList: RawLink[] = [];

    const subLinks: RawLink['directLinks'] = [];
    data.episodes?.forEach((episode: any) => {
      if (!episode?.isSubbed) return;
      const title = `Episode ${episode.number}${episode?.isFiller ? ' (Filler)' : ''}`;
      const epLink = episode.id + '$sub';
      if (title && epLink) {
        subLinks.push({ title, link: epLink });
      }
    });
    if (subLinks.length > 0) {
      linkList.push({ title: `${title} (Sub)`, directLinks: subLinks });
    }

    if (data.subOrDub === 'both') {
      const dubLinks: RawLink['directLinks'] = [];
      data.episodes?.forEach((episode: any) => {
        if (!episode?.isDubbed) return;
        const title = `Episode ${episode.number}${episode?.isFiller ? ' (Filler)' : ''}`;
        const epLink = episode.id + '$dub';
        if (title && epLink) {
          dubLinks.push({ title, link: epLink });
        }
      });
      if (dubLinks.length > 0) {
        linkList.push({ title: `${title} (Dub)`, directLinks: dubLinks });
      }
    }

    return {
      title,
      synopsis,
      image,
      tags,
      type,
      linkList,
      webUrl: link,
    };
  } catch (err) {
    console.error('HiAnime getMeta error:', err);
    throw err;
  }
}