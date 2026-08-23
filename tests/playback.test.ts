import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  chooseEngine,
  clearFailedSources,
  dismissResumeOffer,
  FailureDetector,
  nextEpisode,
  playbackUrl,
  SourceQueue,
  shouldOfferResume,
  updateResumeOffer,
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

describe('playback engine selection', () => {
  it('uses native playback when the browser supports HLS', () => {
    expect(chooseEngine({ ...source('hls'), format: 'hls' }, () => true)).toBe('native');
  });

  it('uses Vidstack HLS when native playback is unavailable', () => {
    expect(chooseEngine({ ...source('hls'), format: 'hls' }, () => false)).toBe('hls');
  });
});

describe('playback failure and resume helpers', () => {
  it('advances on never-started and fatal failures', () => {
    vi.useFakeTimers();
    const failures: string[] = [];
    const detector = new FailureDetector(100, (failure) => failures.push(failure));
    detector.start();
    detector.setPlaying(true);
    vi.advanceTimersByTime(100);
    detector.fatalError();
    expect(failures).toEqual(['never-started', 'fatal-error']);
  });

  it('does not treat a paused source as stalled', () => {
    vi.useFakeTimers();
    const failures: string[] = [];
    const detector = new FailureDetector(100, (failure) => failures.push(failure));
    detector.start();
    detector.setPlaying(false);
    vi.advanceTimersByTime(500);
    expect(failures).toEqual([]);
  });

  it('advances when a playing source stops making progress', () => {
    vi.useFakeTimers();
    const failures: string[] = [];
    const detector = new FailureDetector(100, (failure) => failures.push(failure));
    detector.start();
    detector.markStarted();
    detector.setPlaying(true);
    vi.advanceTimersByTime(100);
    expect(failures).toEqual(['stall']);
  });

  it('ignores the interval while the user is seeking', () => {
    vi.useFakeTimers();
    const failures: string[] = [];
    const detector = new FailureDetector(100, (failure) => failures.push(failure));
    detector.start();
    detector.markStarted();
    detector.setPlaying(true);
    detector.setSeeking(true);
    vi.advanceTimersByTime(500);
    expect(failures).toEqual([]);
    detector.setSeeking(false);
    vi.advanceTimersByTime(100);
    expect(failures).toEqual(['stall']);
  });

  it('offers resume only for meaningful, unfinished progress', () => {
    expect(shouldOfferResume(30, 100)).toBe(true);
    expect(shouldOfferResume(1, 100)).toBe(false);
    expect(shouldOfferResume(99, 100)).toBe(false);
  });

  it('does not reopen a dismissed resume offer when progress is saved again', () => {
    const episodeKey = 'movie::episode-one';
    const initial = updateResumeOffer(undefined, episodeKey, { position: 30, duration: 100 });
    const dismissed = dismissResumeOffer(initial, episodeKey);
    const afterProgressSave = updateResumeOffer(dismissed, episodeKey, {
      position: 45,
      duration: 100,
    });

    expect(initial.visible).toBe(true);
    expect(afterProgressSave).toEqual(dismissed);
    expect(afterProgressSave.visible).toBe(false);
    expect(afterProgressSave.saved).toEqual({ position: 30, duration: 100 });

    const nextEpisodeOffer = updateResumeOffer(afterProgressSave, 'movie::episode-two', {
      position: 20,
      duration: 100,
    });
    expect(nextEpisodeOffer.visible).toBe(true);
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
