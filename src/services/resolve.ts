import type { SearchResult } from '@/types/media';

/** A provider hit plus how well it matched the requested title. */
export type ScoredCandidate = SearchResult & { label: string; score: number };

import { displayTitle } from './normalize';
import { search } from './search';

function overlapScore(queryTitle: string, hitTitle: string): number {
  const words = (value: string): Set<string> =>
    new Set(
      value
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((token) => token && !/^(19|20)\d{2}$/.test(token)),
    );
  const query = words(queryTitle);
  if (query.size === 0) return 0;
  const hitWords = words(hitTitle);
  let found = 0;
  for (const token of query) {
    if (hitWords.has(token)) found += 1;
  }
  return found / query.size;
}

function scoreCandidateFromTitle(
  hitTitle: string,
  inputTitle: string,
  originalTitle: string | undefined,
  year: string | undefined,
): number {
  const clean = displayTitle(hitTitle);
  const titleSim = Math.max(
    overlapScore(inputTitle, clean),
    originalTitle ? overlapScore(originalTitle, clean) : 0,
  );
  const hitYear = clean.match(/\b((?:19|20)\d{2})\b/)?.[1];
  const yearScore = !year || !hitYear ? 0.5 : hitYear === year ? 1 : 0;
  return 0.8 * titleSim + 0.2 * yearScore;
}

/**
 * Every hit a provider returned, ordered by match quality. Nothing is collapsed
 * to one-per-provider: the whole point of the chooser is that the visitor picks
 * the exact release, so two providers offering the same film both stay visible.
 * Identical refs are deduped, and the list is capped so a fuzzy title cannot
 * blow up the page.
 */
const MAX_CANDIDATES = 24;

export function resolveCandidates(
  hits: SearchResult[],
  inputTitle: string,
  originalTitle: string | undefined,
  year: string | undefined,
): { best: ScoredCandidate | null; candidates: ScoredCandidate[] } {
  const scored: Array<{ candidate: SearchResult; score: number }> = [];
  const seen = new Set<string>();
  for (const hit of hits) {
    const key = `${hit.providerId}:${hit.ref}`;
    if (seen.has(key)) continue;
    seen.add(key);
    scored.push({
      candidate: hit,
      score: scoreCandidateFromTitle(hit.title, inputTitle, originalTitle, year),
    });
  }
  scored.sort((left, right) => right.score - left.score);
  const candidates = scored.slice(0, MAX_CANDIDATES).map(({ candidate, score }) => ({
    ...candidate,
    label: candidate.displayTitle,
    score,
  }));
  const top = candidates[0];
  return {
    best: top && top.score >= 0.62 ? top : null,
    candidates,
  };
}

export async function resolveTitle(
  inputTitle: string,
  originalTitle: string | undefined,
  year: string | undefined,
  signal?: AbortSignal,
): Promise<{ best: ScoredCandidate | null; candidates: ScoredCandidate[] }> {
  const hits = await search(inputTitle, undefined, 1, signal);
  const merged = resolveCandidates(hits, inputTitle, originalTitle, year);
  if (!merged.best && originalTitle && originalTitle.toLowerCase() !== inputTitle.toLowerCase()) {
    const extra = await search(originalTitle, undefined, 1, signal);
    const seen = new Set(hits.map((hit) => `${hit.providerId}:${hit.ref}`));
    const extraHits = extra.filter((hit) => !seen.has(`${hit.providerId}:${hit.ref}`));
    return resolveCandidates([...hits, ...extraHits], inputTitle, originalTitle, year);
  }
  return merged;
}
