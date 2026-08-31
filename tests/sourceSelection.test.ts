import { describe, expect, it } from 'vitest';
import { selectStreamSource } from '@/services/sources';
import type { StreamSource } from '@/types';

const src = (id: string, format: StreamSource['format'], quality?: string): StreamSource => ({
  id,
  providerId: 'test',
  label: id,
  url: `https://cdn.test/${id}`,
  format,
  quality,
  subtitles: [],
});

describe('selectStreamSource', () => {
  it('prefers the exact requested source id', () => {
    const list = [src('a', 'mpd'), src('b', 'mp4'), src('c', 'mp4')];
    expect(selectStreamSource(list, 'c')?.id).toBe('c');
  });

  it('falls back to a progressive stream when the requested id rotated away', () => {
    // A re-scrape rotated the signed URLs, so the id the player minted no
    // longer exists — stream the best remaining non-DASH source instead.
    const list = [src('a', 'mpd'), src('b', 'mp4'), src('c', 'mp4')];
    const selected = selectStreamSource(list, 'stale-id');
    expect(selected?.format).toBe('mp4');
    expect(selected?.id).toBe('b');
  });

  it('never promotes a DASH manifest when progressive sources still exist', () => {
    const list = [src('a', 'mpd'), src('b', 'mp4')];
    expect(selectStreamSource(list, 'missing')?.format).not.toBe('mpd');
  });

  it('falls back to the adaptive lead only when it is the sole option', () => {
    expect(selectStreamSource([src('a', 'mpd')], 'missing')?.format).toBe('mpd');
  });

  it('returns the ordered first source when no id is requested', () => {
    const list = [src('a', 'mpd'), src('b', 'mp4')];
    expect(selectStreamSource(list)?.id).toBe('a');
  });

  it('returns undefined only when nothing is available', () => {
    expect(selectStreamSource([])).toBeUndefined();
    expect(selectStreamSource([], 'x')).toBeUndefined();
  });
});
