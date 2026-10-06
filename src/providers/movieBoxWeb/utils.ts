import type * as cheerioLib from 'cheerio';
import { viewer } from '@/lib/viewer';
import { providerBaseUrl } from '../_shared';

// MovieBox Web rotates domains; update the URL in src/providers/urls.ts when the site moves.
export const BASE_URL = providerBaseUrl('movieBoxWeb');

/**
 * JSON API headers. `x-client-info` carries the visitor's own timezone, the way
 * the site sends it — omitted when we do not know it rather than guessed, since
 * the provider uses it to decide what to serve.
 */
export async function requestHeaders(): Promise<Record<string, string>> {
  const { timeZone } = await viewer();
  return {
    Accept: 'application/json',
    'x-source': '',
    ...(timeZone ? { 'x-client-info': JSON.stringify({ timezone: timeZone }) } : {}),
  };
}

export type MovieBoxSubject = {
  subjectId?: string;
  subjectType?: number;
  title?: string;
  description?: string;
  releaseDate?: string;
  genre?: string;
  cover?: { url?: string };
  countryName?: string;
  imdbRatingValue?: string;
  hasResource?: boolean;
  detailPath?: string;
  dubs?: MovieBoxDub[];
};

export type MovieBoxDub = {
  subjectId?: string;
  lanName?: string;
  lanCode?: string;
  original?: boolean;
  detailPath?: string;
};

export type MovieBoxResource = {
  seasons?: Array<{
    se?: number;
    maxEp?: number;
    allEp?: string;
    resolutions?: Array<{ resolution?: number; epNum?: number }>;
  }>;
};

export type MovieBoxDetail = {
  subject: MovieBoxSubject;
  resource: MovieBoxResource;
};

export type PlaybackLink = {
  subjectId: string;
  detailPath: string;
  language: string;
  season?: number;
  episode?: number;
  resolution?: number;
  seasons?: MovieBoxResource['seasons'];
};

export function parseNuxtDetail(html: string, cheerio: typeof cheerioLib): MovieBoxDetail | null {
  return findDetail(parseNuxtData(html, cheerio));
}

export function parseNuxtData(html: string, cheerio: typeof cheerioLib): unknown {
  const $ = cheerio.load(html);
  const serialized = $('#__NUXT_DATA__').text();
  if (!serialized) return null;

  return decodeNuxtData(JSON.parse(serialized));
}

function decodeNuxtData(values: unknown): unknown {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error('Invalid Nuxt data');
  }

  const entries = values as unknown[];
  const hydrated: unknown[] = new Array(entries.length);

  function hydrate(index: unknown): unknown {
    if (index === -1 || index === -2) return undefined;
    if (index === -3) return NaN;
    if (index === -4) return Infinity;
    if (index === -5) return -Infinity;
    if (index === -6) return -0;
    if (typeof index !== 'number' || index < 0 || index >= entries.length) {
      throw new Error('Invalid Nuxt data index');
    }
    if (Object.hasOwn(hydrated, index)) {
      return hydrated[index];
    }

    const value = entries[index];
    if (!value || typeof value !== 'object') {
      hydrated[index] = value;
      return value;
    }

    if (Array.isArray(value)) {
      const type = value[0];
      if (
        type === 'Reactive' ||
        type === 'ShallowReactive' ||
        type === 'Ref' ||
        type === 'ShallowRef'
      ) {
        const result = hydrate(value[1]);
        hydrated[index] = result;
        return result;
      }
      if (type === 'Set') {
        const result = new Set<unknown>();
        hydrated[index] = result;
        for (let item = 1; item < value.length; item++) {
          result.add(hydrate(value[item]));
        }
        return result;
      }
      if (typeof type === 'string') {
        throw new Error(`Unsupported Nuxt data type: ${type}`);
      }

      const result: unknown[] = [];
      hydrated[index] = result;
      for (const item of value) {
        result.push(item === -2 ? undefined : hydrate(item));
      }
      return result;
    }

    const result: Record<string, unknown> = {};
    hydrated[index] = result;
    for (const [key, item] of Object.entries(value)) {
      if (key === '__proto__') throw new Error('Invalid Nuxt data key');
      result[key] = hydrate(item);
    }
    return result;
  }

  return hydrate(0);
}

function findDetail(value: unknown): MovieBoxDetail | null {
  if (!value || typeof value !== 'object') return null;
  if (
    'subject' in value &&
    'resource' in value &&
    typeof value.subject === 'object' &&
    typeof value.resource === 'object'
  ) {
    return value as MovieBoxDetail;
  }

  for (const child of Object.values(value)) {
    const result = findDetail(child);
    if (result) return result;
  }
  return null;
}

export function detailPath(link: string): string {
  return link.replace(/^https?:\/\/[^/]+/, '').replace(/^\/moviesDetail\//, '');
}
