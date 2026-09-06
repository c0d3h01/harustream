import { describe, expect, it, vi } from 'vitest';
import { resolveCandidates, resolveTitle, scoreCandidate } from '@/services/resolve';
import type { SearchResult } from '@/types';

vi.mock('@/services/search', () => ({ search: vi.fn() }));

import { search } from '@/services/search';

const mockedSearch = vi.mocked(search);

const hit = (overrides: Partial<SearchResult> & { title: string }): SearchResult => ({
  id: 'test:1',
  providerId: 'movieBoxWeb',
  providerName: 'MovieBox Web',
  displayTitle: overrides.title,
  ref: `https://cdn.test/${overrides.title}`,
  ...overrides,
});

const input = { kind: 'movie' as const, tmdbId: 1, title: 'Dune', year: '2021' };

describe('scoreCandidate', () => {
  it('scores exact title and year matches near 1', () => {
    expect(scoreCandidate(input, hit({ title: 'Dune (2021)' }))).toBeGreaterThanOrEqual(0.9);
  });

  it('sees through dub/quality noise via displayTitle', () => {
    const noisy = hit({ title: 'Download Dune Season 1 Hindi Dubbed 480p 720p' });
    expect(scoreCandidate(input, noisy)).toBeGreaterThanOrEqual(0.62);
  });

  it('penalizes year mismatches so remakes order correctly', () => {
    const correct = scoreCandidate(input, hit({ title: 'Dune (2021)' }));
    const remake = scoreCandidate(input, hit({ title: 'Dune (1984)' }));
    expect(correct).toBeGreaterThan(remake);
  });

  it('stays neutral when either side lacks a year', () => {
    const noYear = scoreCandidate({ ...input, year: undefined }, hit({ title: 'Dune' }));
    expect(noYear).toBeCloseTo(0.9, 1);
  });

  it('rejects unrelated titles', () => {
    expect(scoreCandidate(input, hit({ title: 'Oppenheimer' }))).toBeLessThan(0.62);
  });
});

describe('resolveCandidates', () => {
  it('keeps one candidate per provider — a provider with a poor hit never crowds out another provider', () => {
    const hits = [
      hit({ title: 'Dune (2021)', providerId: 'providerA', providerName: 'Provider A' }),
      hit({ title: 'Dune (1984)', providerId: 'providerB', providerName: 'Provider B' }),
      // Unrelated to the query and below the sanity floor — filtered out
      // entirely rather than surfacing as a fake "channel" for this title.
      hit({ title: 'Oppenheimer', providerId: 'providerC', providerName: 'Provider C' }),
    ];
    const result = resolveCandidates(input, hits);
    expect(result.best?.label).toBe('Dune (2021)');
    expect(result.best?.providerId).toBe('providerA');
    expect(result.candidates.map((candidate) => candidate.providerId)).toEqual([
      'providerA',
      'providerB',
    ]);
    expect(result.candidates[0].score).toBeGreaterThanOrEqual(result.candidates[1].score);
  });

  it('keeps only a provider’s single best-scoring hit', () => {
    const hits = [
      hit({ title: 'Oppenheimer', providerId: 'providerA' }),
      hit({ title: 'Dune (2021)', providerId: 'providerA' }),
    ];
    const result = resolveCandidates(input, hits);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].label).toBe('Dune (2021)');
  });

  it('returns null best but keeps a candidate that clears the sanity floor without clearing the auto-play threshold', () => {
    // A single-token query ('Dune') is bimodal against token-set scoring:
    // either a hit contains the token (score high) or it doesn't (score
    // near zero). A multi-word query lets a partial match land in between.
    const partialInput = { kind: 'movie' as const, tmdbId: 2, title: 'Dune Part Two', year: '2024' };
    const result = resolveCandidates(partialInput, [hit({ title: 'Dune' })]);
    expect(result.best).toBeNull();
    expect(result.candidates).toHaveLength(1);
  });

  it('filters out a hit that never clears the sanity floor', () => {
    const result = resolveCandidates(input, [hit({ title: 'Oppenheimer' })]);
    expect(result.best).toBeNull();
    expect(result.candidates).toHaveLength(0);
  });

  it('returns empty results with no hits', () => {
    expect(resolveCandidates(input, [])).toEqual({ best: null, candidates: [] });
  });
});

describe('resolveTitle', () => {
  it('falls back to the original title when the localized title misses', async () => {
    mockedSearch.mockImplementation(async (query: string) =>
      query === 'Hindi Title' ? [hit({ title: 'Unrelated' })] : [hit({ title: 'Original (2021)' })],
    );
    const result = await resolveTitle({
      kind: 'movie',
      tmdbId: 9,
      title: 'Hindi Title',
      originalTitle: 'Original',
      year: '2021',
    });
    expect(mockedSearch).toHaveBeenCalledTimes(2);
    expect(result.best?.label).toBe('Original (2021)');
  });

  it('skips the second fan-out when the first title already matches', async () => {
    mockedSearch.mockReset();
    mockedSearch.mockResolvedValue([hit({ title: 'Dune (2021)' })]);
    const result = await resolveTitle({
      kind: 'movie',
      tmdbId: 1,
      title: 'Dune',
      originalTitle: 'Dune',
      year: '2021',
    });
    expect(mockedSearch).toHaveBeenCalledTimes(1);
    expect(result.best?.label).toBe('Dune (2021)');
  });
});
