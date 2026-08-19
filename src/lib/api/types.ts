import { z } from 'zod';

// --- Catalog (categories) ---

// /api/catalog returns a list of categories, each with a `filter` value that
// you can use as a search prefix to narrow results. Items are NOT returned
// here — the home screen must fetch a top-level list via search or some other
// discovery endpoint. We expose categories for potential "browse by category"
// UI but our home currently shows a featured hero driven by a default search.
export const CategorySchema = z
  .object({
    title: z.string(),
    filter: z.string(),
  })
  .passthrough();
export type Category = z.infer<typeof CategorySchema>;

// --- Search results / discovery ---

// /api/search and similar discovery endpoints return Media-shaped items. The
// upstream's `link` field is the path that uniquely identifies a title; it
// doubles as the id for subsequent meta/episode/stream calls.
export const MediaSchema = z
  .object({
    title: z.string(),
    link: z.string(),
    // Providers commonly emit `null` for optional fields; `nullish()` accepts
    // undefined, null, or a value so a single null never fails the whole feed.
    image: z.string().nullish(),
    type: z.string().nullish(),
    providerId: z.string().nullish(),
    providerName: z.string().nullish(),
    providerIds: z.array(z.string()).nullish(),
    providerNames: z.array(z.string()).nullish(),
  })
  .passthrough();
export type Media = z.infer<typeof MediaSchema>;

// --- Meta ---

// /api/meta returns the full detail for a single title. `linkList` is an
// array of "quality" entries (e.g. 480p, 720p, 1080p). Each entry has either
// `directLinks` (for movies: the actual m3u8/mp4 URLs) or `episodesLink`
// (for series: a page listing the per-episode links).
export const LinkSourceSchema = z
  .object({
    title: z.string().nullish(),
    link: z.string().nullish(),
    type: z.string().nullish(),
  })
  .passthrough();

export const LinkEntrySchema = z
  .object({
    title: z.string().nullish(),
    quality: z.string().nullish(),
    directLinks: z.array(LinkSourceSchema).nullish(),
    episodesLink: z.string().nullish(),
  })
  .passthrough();

export const MetaSchema = z
  .object({
    title: z.string().nullish(),
    synopsis: z.string().nullish(),
    image: z.string().nullish(),
    imdbId: z.string().nullish(),
    type: z.string().nullish(),
    linkList: z.array(LinkEntrySchema).nullish(),
    webUrl: z.string().nullish(),
    poster: z.string().nullish(),
    logo: z.string().nullish(),
    tmdbId: z.string().nullish(),
    tags: z.array(z.string()).nullish(),
    cast: z.array(z.string()).nullish(),
    rating: z.string().nullish(),
  })
  .passthrough();
export type Meta = z.infer<typeof MetaSchema>;
export type LinkEntry = z.infer<typeof LinkEntrySchema>;

// Picks the first streamable URL from a Meta payload. For movies, that is
// `linkList[0].directLinks[0].link`. For series, each linkList entry has
// `episodesLink` instead; the upstream's /api/stream endpoint must resolve
// those into playable URLs.
export function pickHubUrl(meta: Meta): string | undefined {
  const entry = meta.linkList?.[0];
  if (!entry) return undefined;
  return entry.directLinks?.[0]?.link ?? entry.episodesLink ?? undefined;
}

// Ranks a linkList entry by its advertised resolution/quality so we can
// prefer the highest available quality. Falls back to a plain numeric sort
// on the label when no resolution is parseable.
export function qualityRank(title?: string | null, quality?: string | null): number {
  const label = (quality || title || '').toLowerCase();
  const match = label.match(/(\d{3,4})p/) ?? label.match(/(\d{3,4})/);
  if (!match) return 0;
  const value = Number(match[1]);
  if (value >= 2160) return 2160;
  if (value >= 1440) return 1440;
  if (value >= 1080) return 1080;
  if (value >= 720) return 720;
  if (value >= 480) return 480;
  if (value >= 360) return 360;
  return 240;
}

export function sortLinkListByQuality(list?: LinkEntry[] | null): LinkEntry[] {
  if (!list) return [];
  return [...list].sort((a, b) => {
    const rankA = qualityRank(a.title, a.quality);
    const rankB = qualityRank(b.title, b.quality);
    if (rankA !== rankB) return rankB - rankA;
    return (a.title || '').localeCompare(b.title || '');
  });
}

// Preferred hub: the highest-quality entry. Movies expose `directLinks[0].link`,
// series expose `episodesLink`.
export function pickBestHubUrl(meta: Meta): string | undefined {
  const [entry] = sortLinkListByQuality(meta.linkList);
  if (!entry) return undefined;
  // Normalize null → undefined so callers keep a `string | undefined` type.
  return entry.directLinks?.[0]?.link ?? entry.episodesLink ?? undefined;
}

// --- Episodes ---

// /api/episodes returns a list of episode links for a series URL. Each entry
// is a link that can be passed to /api/stream.
export const EpisodeSchema = z
  .object({
    title: z.string(),
    link: z.string(),
  })
  .passthrough();
export type Episode = z.infer<typeof EpisodeSchema>;

// --- Stream ---

// /api/stream follows a hub link (a provider's hoster page) and returns the
// actual playable m3u8/mp4 links wrapped in { server, link, type }, plus the
// optional quality/subtitles/headers the provider modules emit.
const SourceSchema = z
  .object({
    server: z.string().nullish(),
    link: z.string().nullish(),
    type: z.string().nullish(),
    url: z.string().nullish(),
    quality: z.string().nullish(),
    subtitles: z.unknown().nullish(),
    headers: z.record(z.string()).nullish(),
  })
  .passthrough();

export const StreamSchema = z.array(SourceSchema).optional();
export type Stream = z.infer<typeof StreamSchema>;

export type ResolvedStream =
  | {
      kind: 'sources';
      sources: { server?: string; link: string; type?: string; headers?: Record<string, string> }[];
    }
  | { kind: 'none' };

export function resolveStream(stream: Stream | null | undefined): ResolvedStream {
  if (!stream || !Array.isArray(stream) || stream.length === 0) {
    return { kind: 'none' };
  }
  const sources: {
    server?: string;
    link: string;
    type?: string;
    headers?: Record<string, string>;
  }[] = [];
  for (const s of stream) {
    const link = s.link ?? s.url;
    if (!link) continue;
    sources.push({
      server: s.server ?? undefined,
      link,
      type: s.type ?? undefined,
      headers: s.headers ?? undefined,
    });
  }
  if (sources.length === 0) return { kind: 'none' };
  return { kind: 'sources', sources };
}

// --- View helpers ---

// Media's `link` is its identity. We expose it as `id` so the rest of the app
// can keep a single identifier concept.
export function idOf(item: { link: string }): string {
  return item.link;
}

export function imageFor(item: {
  image?: string | null;
  poster?: string | null;
  backdrop?: string | null;
}): string {
  return item.image || item.backdrop || item.poster || '';
}

export function titleFor(item: { title?: string | null; name?: string | null }): string {
  return item.title || item.name || 'Untitled';
}

// Trims a long catalog title down to its core name + year, dropping the
// trailing release/encoding metadata (e.g. "Incantation (2022) WEB-DL
// {English With Subtitles} Full Movie 720p [1GB]" → "Incantation (2022)").
export function shortTitleFor(item: { title?: string; name?: string }): string {
  const full = titleFor(item).trim();
  // Keep everything up to and including the year (parenthesized or bare).
  const yearMatch = full.match(/^(.*?\(?\s*(?:19\d{2}|20\d{2})\)?)/i);
  if (yearMatch && yearMatch[1].trim().length > 3) {
    return yearMatch[1].trim();
  }
  // No year — drop everything after the first separator.
  return full.split(/[|\u2013-]/)[0]?.trim() || full;
}
