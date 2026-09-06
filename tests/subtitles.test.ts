import { describe, expect, it } from 'vitest';
import { srtToVtt, ttmlToVtt } from '@/lib/streaming/subtitles';

describe('subtitle conversion', () => {
  it('converts TTML cues to browser-compatible VTT', () => {
    expect(
      ttmlToVtt(
        '<tt><body><p begin="00:00:01.000" end="00:00:02.500">Hello<br/>world &amp; more</p></body></tt>',
      ),
    ).toBe('WEBVTT\n\n00:00:01.000 --> 00:00:02.500\nHello\nworld & more\n');
  });

  it('converts SRT cues to browser-compatible VTT', () => {
    expect(srtToVtt('1\n00:00:01,000 --> 00:00:02,500\nHello\nworld')).toBe(
      'WEBVTT\n\n00:00:01.000 --> 00:00:02.500\nHello\nworld\n',
    );
  });
});
