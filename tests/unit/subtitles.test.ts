import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { srtToVtt, ttmlToVtt } from '@/lib/streaming/subtitles';

describe('subtitle conversion', () => {
  it('converts TTML cues to browser-compatible VTT', () => {
    assert.strictEqual(
      ttmlToVtt(
        '<tt><body><p begin="00:00:01.000" end="00:00:02.500">Hello<br/>world &amp; more</p></body></tt>',
      ),
      'WEBVTT\n\n00:00:01.000 --> 00:00:02.500\nHello\nworld & more\n',
    );
  });

  it('converts SRT cues to browser-compatible VTT', () => {
    assert.strictEqual(
      srtToVtt('1\n00:00:01,000 --> 00:00:02,500\nHello\nworld'),
      'WEBVTT\n\n00:00:01.000 --> 00:00:02.500\nHello\nworld\n',
    );
  });
});
