import * as cheerio from 'cheerio';
import type { RawPost } from '../_shared';
import { BASE_URL, parseNuxtData } from './utils';

type SubjectPreview = {
  detailPath?: string;
  title?: string;
  coverUrl?: string;
};

function collectSubjectPreviews(value: unknown): Map<string, SubjectPreview> {
  const subjects = new Map<string, SubjectPreview>();
  const visited = new Set<object>();

  function visit(current: unknown): void {
    if (!current || typeof current !== 'object' || visited.has(current)) return;
    visited.add(current);

    if ('detailPath' in current && typeof current.detailPath === 'string') {
      const cover = 'cover' in current ? current.cover : undefined;
      subjects.set(current.detailPath, {
        title: 'title' in current && typeof current.title === 'string' ? current.title : undefined,
        coverUrl:
          cover && typeof cover === 'object' && 'url' in cover && typeof cover.url === 'string'
            ? cover.url
            : undefined,
      });
    }
    Object.values(current).forEach(visit);
  }

  visit(value);
  return subjects;
}

async function fetchSearchPage(query: string, signal: AbortSignal | undefined): Promise<RawPost[]> {
  const path = `/newWeb/searchResult?keyword=${encodeURIComponent(query.trim())}`;
  const response = await fetch(new URL(path, `${BASE_URL}/`).toString(), { signal });
  if (!response.ok) throw new Error(`MovieBox Web returned ${response.status}`);

  const html = await response.text();
  const $ = cheerio.load(html);
  const subjects = collectSubjectPreviews(parseNuxtData(html, cheerio));
  const posts: RawPost[] = [];
  const seen = new Set<string>();

  $('a[href^="/moviesDetail/"]').each((_, element) => {
    const card = $(element);
    const href = card.attr('href') || '';
    if (!href.startsWith('/moviesDetail/') || seen.has(href)) return;
    const subject = subjects.get(href.replace('/moviesDetail/', ''));

    const image = card.find('img').first();
    const title =
      subject?.title?.trim() ||
      card.find('h2, h3').first().attr('title')?.trim() ||
      image.attr('alt')?.trim() ||
      card.find('h2, h3').first().text().trim() ||
      card
        .attr('title')
        ?.replace(/^go to /i, '')
        .replace(/ detail page$/i, '')
        .trim() ||
      '';
    if (!title) return;

    seen.add(href);
    posts.push({
      title,
      link: href,
      image: image.attr('data-src') || subject?.coverUrl || image.attr('src') || '',
    });
  });
  return posts;
}

export const getSearchPosts = async ({
  query,
  page,
  signal,
}: {
  query: string;
  page: number;
  signal?: AbortSignal;
}): Promise<RawPost[]> => {
  if (page > 1 || !query.trim()) return [];
  return fetchSearchPage(query, signal);
};
