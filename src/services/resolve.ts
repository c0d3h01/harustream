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
  /** Provider's own scraped poster/thumbnail, when it returned one — the
   *  primary visual disambiguator in the source picker: a mismatched
   *  thumbnail is visible before the user ever presses play. */
  posterUrl?: string;
  score: number;
}

export interface ResolveResult {
  /** Top-ranked candidate, for the "Best match" badge only — never consumed
   *  for navigation. This app is an aggregator: TMDB supplies browsing
   *  metadata, but which channel actually carries a title is always the
   *  user's call, since fuzzy title matching can't be certain (remakes,
   *  dubs, wrong season). */
  best: ResolveCandidate | null;
  /** One candidate per provider that cleared `RESOLVE_MIN_SCORE`, best
   *  first — "which channels carry this", not "the highest-scoring rows
   *  regardless of channel". A provider with several near-duplicate hits
   *  no longer crowds every other provider out of the list. */
  candidates: ResolveCandidate[];
}

/** Score threshold for the "Best match" badge. Tuned in tests (see
 *  resolve.test.ts). No longer gates navigation — see `ResolveResult.best`. */
export const RESOLVE_AUTO_THRESHOLD = 0.62;
/** Sanity floor below which a provider's best hit is noise, not a genuine
 *  candidate — filters total mismatches without second-guessing anything
 *  close to a real match. */
export const RESOLVE_MIN_SCORE = 0.35;

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
  // One candidate per provider: keep only each provider's best-scoring hit
  // so a provider with several near-duplicate listings can't crowd every
  // other provider out of the result.
  const bestPerProvider = new Map<string, ResolveCandidate>();
  for (const hit of hits) {
    const score = scoreCandidate(input, hit);
    const existing = bestPerProvider.get(hit.providerId);
    if (existing && existing.score >= score) continue;
    bestPerProvider.set(hit.providerId, {
      providerId: hit.providerId,
      providerName: hit.providerName,
      ref: hit.ref,
      label: hit.displayTitle,
      posterUrl: hit.posterUrl,
      score,
    });
  }
  const candidates = Array.from(bestPerProvider.values())
    .filter((candidate) => candidate.score >= RESOLVE_MIN_SCORE)
    .sort((left, right) => right.score - left.score);
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
