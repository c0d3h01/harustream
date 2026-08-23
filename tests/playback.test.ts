import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearFailedSources,
  FailureDetector,
  nextEpisode,
  playbackUrl,
  SourceQueue,
  shouldOfferResume,
} from '@/playback';
import type { StreamSource } from '@/types';

const source = (id: string, quality = id): StreamSource => ({
  id,
  providerId: 'test',
  label: id,
  url: `https://cdn.test/${id}.mp4`,
  format: 'mp4',
  quality,
  subtitles: [],
});

afterEach(() => {
  clearFailedSources();
  vi.useRealTimers();
});

describe('playback source queue', () => {
  it('preserves deterministic ordering and falls through failed sources', () => {
    const queue = new SourceQueue([source('first'), source('second'), source('third')]);
    expect(queue.nextSource()?.id).toBe('first');
    expect(queue.failCurrent()?.id).toBe('second');
    expect(queue.failCurrent()?.id).toBe('third');
    expect(queue.failCurrent()).toBeUndefined();
    expect(queue.state).toBe('exhausted');
  });

  it('does not retry a failed source in a new episode queue', () => {
    const first = new SourceQueue([source('shared'), source('fallback')]);
    first.nextSource();
    first.failCurrent();
    const second = new SourceQueue([source('shared'), source('episode-two')]);
    expect(second.nextSource()?.id).toBe('episode-two');
  });
});

describe('playback failure and resume helpers', () => {
  it('advances on never-started and fatal failures', () => {
    vi.useFakeTimers();
    const failures: string[] = [];
    const detector = new FailureDetector(100, (failure) => failures.push(failure));
    detector.start();
    vi.advanceTimersByTime(100);
    detector.fatalError();
    expect(failures).toEqual(['never-started', 'fatal-error']);
  });

  it('offers resume only for meaningful, unfinished progress', () => {
    expect(shouldOfferResume(30, 100)).toBe(true);
    expect(shouldOfferResume(1, 100)).toBe(false);
    expect(shouldOfferResume(99, 100)).toBe(false);
  });

  it('selects the next episode only when auto advance is enabled', () => {
    expect(nextEpisode(['one', 'two'], 0, true)).toBe('two');
    expect(nextEpisode(['one', 'two'], 0, false)).toBeUndefined();
    expect(nextEpisode(['one', 'two'], 1, true)).toBeUndefined();
  });
});

describe('playback proxy URL', () => {
  it('forwards supported headers and ignores arbitrary provider headers', () => {
    const url = new URL(
      `https://app.test${playbackUrl('https://cdn.test/master.m3u8?sig=abc', {
        Referer: 'https://provider.test',
        Origin: 'https://provider.test',
        'User-Agent': 'player',
        Cookie: 'session=1',
        Authorization: 'secret',
      })}`,
    );
    expect(url.searchParams.get('url')).toBe('https://cdn.test/master.m3u8?sig=abc');
    expect(url.searchParams.get('referer')).toBe('https://provider.test');
    expect(url.searchParams.get('origin')).toBe('https://provider.test');
    expect(url.searchParams.get('userAgent')).toBe('player');
    expect(url.searchParams.get('cookie')).toBe('session=1');
    expect(url.searchParams.has('Authorization')).toBe(false);
  });
});
