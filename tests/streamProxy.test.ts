import { describe, expect, it } from 'vitest';
import { rewriteHlsManifest, srtToVtt, ttmlToVtt } from '@/lib/media/streamProxy';

describe('HLS manifest rewriting', () => {
  it('proxies URI attributes and bare relative and absolute resources', () => {
    const manifest = [
      '#EXTM3U',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",URI="audio/en.m3u8?token=a"',
      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",URI="../subs/en.vtt?sig=s"',
      '#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=1000,URI="iframes/low.m3u8"',
      '#EXT-X-STREAM-INF:BANDWIDTH=2000',
      'video/main.m3u8?token=v',
    ].join('\n');
    const rewritten = rewriteHlsManifest(
      manifest,
      'https://cdn.test/path/master.m3u8?manifest=signed',
      { referer: 'https://provider.test' },
    );
    expect(rewritten).toContain(
      'URI="/api/proxy?url=https%3A%2F%2Fcdn.test%2Fpath%2Faudio%2Fen.m3u8%3Ftoken%3Da&referer=https%3A%2F%2Fprovider.test"',
    );
    expect(rewritten).toContain(
      'URI="/api/proxy?url=https%3A%2F%2Fcdn.test%2Fsubs%2Fen.vtt%3Fsig%3Ds&referer=https%3A%2F%2Fprovider.test"',
    );
    expect(rewritten).toContain(
      'URI="/api/proxy?url=https%3A%2F%2Fcdn.test%2Fpath%2Fiframes%2Flow.m3u8&referer=https%3A%2F%2Fprovider.test"',
    );
    expect(rewritten).toContain(
      '/api/proxy?url=https%3A%2F%2Fcdn.test%2Fpath%2Fvideo%2Fmain.m3u8%3Ftoken%3Dv&referer=https%3A%2F%2Fprovider.test',
    );
  });

  it('rewrites encryption keys and initialization maps without changing other attributes', () => {
    const manifest = [
      '#EXTM3U',
      '#EXT-X-KEY:METHOD=AES-128,URI="https://keys.test/key.bin?sig=k",IV=0x1',
      '#EXT-X-MAP:URI="init.mp4?sig=i",BYTERANGE="720@0"',
      '#EXTINF:6,',
      'segment-1.ts?sig=x',
    ].join('\n');
    const rewritten = rewriteHlsManifest(manifest, 'https://cdn.test/video/index.m3u8');
    expect(rewritten).toContain('METHOD=AES-128');
    expect(rewritten).toContain('IV=0x1');
    expect(rewritten).toContain('BYTERANGE="720@0"');
    expect(rewritten.match(/\/api\/proxy\?/g)).toHaveLength(3);
    expect(rewritten).toContain('key.bin%3Fsig%3Dk');
    expect(rewritten).toContain('init.mp4%3Fsig%3Di');
    expect(rewritten).toContain('segment-1.ts%3Fsig%3Dx');
  });
});

describe('subtitle conversion', () => {
  it('converts TTML cues to browser-compatible VTT at the proxy boundary', () => {
    expect(
      ttmlToVtt(
        '<tt><body><p begin="00:00:01.000" end="00:00:02.500">Hello<br/>world &amp; more</p></body></tt>',
      ),
    ).toBe('WEBVTT\n\n00:00:01.000 --> 00:00:02.500\nHello\nworld & more\n');
  });

  it('converts SRT cues to browser-compatible VTT at the proxy boundary', () => {
    expect(srtToVtt('1\n00:00:01,000 --> 00:00:02,500\nHello\nworld')).toBe(
      'WEBVTT\n\n00:00:01.000 --> 00:00:02.500\nHello\nworld\n',
    );
  });
});
