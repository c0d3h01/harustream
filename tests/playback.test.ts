import { afterEach, describe, expect, it, vi } from 'vitest';
import { FailureDetector } from '@/components/playback/failure';
import { clearFailedSources, SourceQueue } from '@/components/playback/queue';
import {
  mediaPlaybackUrl,
  playbackUrl,
  playerSrc,
  streamPlaybackUrl,
} from '@/lib/media/playbackHref';
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
  });

  it('does not retry a failed source in a new episode queue', () => {
    const first = new SourceQueue([source('shared'), source('fallback')]);
    first.nextSource();
    first.failCurrent();
    const second = new SourceQueue([source('shared'), source('episode-two')]);
    expect(second.nextSource()?.id).toBe('episode-two');
  });
});

describe('playback src type hints', () => {
  it('hints formats so vidstack selects the right provider', () => {
    expect(playerSrc('/api/proxy?url=https%3A%2F%2Fcdn.test%2Fx.m3u8', 'hls')).toMatchObject({
      type: 'application/x-mpegurl',
    });
    expect(playerSrc('https://cdn.test/x.mpd', 'mpd')).toMatchObject({
      type: 'application/dash+xml',
    });
    expect(playerSrc('https://cdn.test/x.mp4', 'mp4')).toMatchObject({ type: 'video/mp4' });
    expect(playerSrc('https://cdn.test/x.mkv', 'mkv')).toMatchObject({
      type: 'video/x-matroska',
    });
    expect(playerSrc('https://cdn.test/stream', undefined)).toMatchObject({ type: 'video/*' });
  });
});

describe('playback failure detector', () => {
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

  it('points the main media src at the single resolving proxy route', () => {
    const url = new URL(
      `https://app.test${streamPlaybackUrl(source('first'), {
        providerId: 'movieBoxWeb',
        ref: '{"subjectId":"1"}',
        kind: 'series',
      })}`,
    );
    expect(url.pathname).toBe('/api/proxy');
    expect(url.searchParams.get('provider')).toBe('movieBoxWeb');
    expect(url.searchParams.get('ref')).toBe('{"subjectId":"1"}');
    expect(url.searchParams.get('kind')).toBe('series');
    expect(url.searchParams.get('sourceId')).toBe('first');
  });

  it('plays DASH sources directly with no proxy', () => {
    const dash = { ...source('dash'), format: 'mpd' as const, url: 'https://cdn.test/x.mpd?q=1' };
    const context = { providerId: 'movieBoxWeb', ref: '{"subjectId":"1"}', kind: 'series' };
    expect(mediaPlaybackUrl(dash, context)).toBe('https://cdn.test/x.mpd?q=1');
  });

  it('routes non-DASH media through the Cloudflare worker when configured', () => {
    const mp4 = source('first');
    const url = new URL(
      mediaPlaybackUrl(
        mp4,
        {
          providerId: 'movieBoxWeb',
          ref: '{"subjectId":"1"}',
          kind: 'series',
        },
        'https://proxy.workers.dev',
      ),
    );
    expect(url.origin).toBe('https://proxy.workers.dev');
    expect(url.searchParams.get('url')).toBe(mp4.url);
  });
});
