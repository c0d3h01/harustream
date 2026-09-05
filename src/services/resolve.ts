import type { SearchResult } from '@/types';
import { displayTitle } from './normalize';
import { search } from './search';

export interface ResolveInput {
  kind: 'movie' | 'tv';
  tmdbId: number;
  title: string;
  originalTitle?: string;
  year?: string;
}

export interface ResolveCandidate {
  providerId: string;
  providerName: string;
  ref: string;
  label: string;
  score: number;
}

export interface ResolveResult {
  /** Top hit when it clears the auto-play threshold, else null (show picker). */
  best: ResolveCandidate | null;
  /** Up to 6 hits, best first, for the picker. */
  candidates: ResolveCandidate[];
}

/** Minimum score for silent auto-play. Tuned in tests (see resolve.test.ts). */
export const RESOLVE_AUTO_THRESHOLD = 0.62;

function tokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

/** Dice coefficient over token sets — tolerant to word order and extras. */
function dice(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) return 0;
  const rightSet = new Set(right);
  let hits = 0;
  for (const token of new Set(left)) {
    if (rightSet.has(token)) hits += 1;
  }
  return (2 * hits) / (new Set(left).size + rightSet.size);
}

/** Fraction of query tokens present in the hit — recall-oriented so dub /
 *  quality noise ("Season 1 Hindi Dubbed 480p") can't sink a true match. */
function recall(query: string[], hit: string[]): number {
  if (query.length === 0) return 0;
  const hitSet = new Set(hit);
  let found = 0;
  for (const token of new Set(query)) {
    if (hitSet.has(token)) found += 1;
  }
  return found / new Set(query).size;
}

function isYearToken(token: string): boolean {
  return /^(19|20)\d{2}$/.test(token);
}

/** Drop year tokens (years score separately); keep everything when that
 *  would empty the list (e.g. the film is literally called "2012"). */
function contentTokens(value: string): string[] {
  const all = tokens(value);
  const stripped = all.filter((token) => !isYearToken(token));
  return stripped.length > 0 ? stripped : all;
}

function yearOfHit(title: string): string | undefined {
  return title.match(/\b(19|20)\d{2}\b/)?.[0];
}

function titleSimilarity(queryTitle: string, hitTitle: string): number {
  const query = contentTokens(queryTitle);
  const hitTokens = contentTokens(hitTitle);
  return 0.6 * recall(query, hitTokens) + 0.4 * dice(query, hitTokens);
}

export function scoreCandidate(input: ResolveInput, hit: SearchResult): number {
  const clean = displayTitle(hit.title);
  const titleSim = Math.max(
    titleSimilarity(input.title, clean),
    input.originalTitle ? titleSimilarity(input.originalTitle, clean) : 0,
  );
  // Search hits carry no kind signal, so the score is title-dominant with a
  // year term that disambiguates remakes (Dune 1984 vs 2021) and stays
  // neutral when either side lacks a year.
  const hitYear = yearOfHit(hit.title);
  const yearScore = !input.year || !hitYear ? 0.5 : hitYear === input.year ? 1 : 0;
  return 0.8 * titleSim + 0.2 * yearScore;
}

export function resolveCandidates(input: ResolveInput, hits: SearchResult[]): ResolveResult {
  const scored: ResolveCandidate[] = hits.map((hit) => ({
    providerId: hit.providerId,
    providerName: hit.providerName,
    ref: hit.ref,
    label: hit.displayTitle,
    score: scoreCandidate(input, hit),
  }));
  scored.sort((left, right) => right.score - left.score);
  const candidates = scored.slice(0, 6);
  const top = candidates[0];
  return { best: top && top.score >= RESOLVE_AUTO_THRESHOLD ? top : null, candidates };
}

function hitKey(hit: SearchResult): string {
  return `${hit.providerId}:${hit.ref}`;
}

export async function resolveTitle(
  input: ResolveInput,
  signal?: AbortSignal,
): Promise<ResolveResult> {
  const hits = await search(input.title, undefined, 1, signal);
  let merged = resolveCandidates(input, hits);
  // Non-English originals often match better under the original title
  // (e.g. anime). Only pay for the second fan-out when the first came up short.
  if (
    !merged.best &&
    input.originalTitle &&
    input.originalTitle.toLowerCase() !== input.title.toLowerCase()
  ) {
    const extra = await search(input.originalTitle, undefined, 1, signal);
    const seen = new Set(hits.map(hitKey));
    merged = resolveCandidates(input, [...hits, ...extra.filter((hit) => !seen.has(hitKey(hit)))]);
  }
  return merged;
}
