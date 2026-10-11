import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { decodeBase64Url } from '@/lib/base64url';
import {
  manifestKind,
  rewriteDashManifest,
  rewriteHlsManifest,
} from '@/lib/streaming/manifestRewriter';
import { streamHref } from '@/lib/streaming/streamUrl';

const toHref = (url: string) => streamHref('providerA', url);

function decodeTarget(href: string): string {
  const encoded = href.split('?')[0].split('/').filter(Boolean)[3];
  return decodeBase64Url(encoded);
}

describe('manifestKind', () => {
  it('classifies by extension and content-type', () => {
    assert.strictEqual(manifestKind(null, 'https://cdn.test/master.m3u8?x=1'), 'hls');
    assert.strictEqual(manifestKind('application/dash+xml', 'https://cdn.test/x'), 'dash');
    assert.strictEqual(manifestKind('video/mp4', 'https://cdn.test/video.mp4'), null);
  });
});

describe('rewriteHlsManifest', () => {
  it('rewrites URI attributes and bare segment lines to stream paths', () => {
    const manifest = [
      '#EXTM3U',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",URI="audio/en.m3u8?token=a"',
      '#EXT-X-KEY:METHOD=AES-128,URI="key.bin?sig=k",IV=0x1',
      '#EXTINF:6,',
      'segment-1.ts?sig=x',
    ].join('\n');
    const rewritten = rewriteHlsManifest(
      manifest,
      'https://cdn.test/path/master.m3u8?manifest=signed',
      toHref,
    );

    assert.ok(rewritten.includes('IV=0x1'));
    const hrefs = Array.from(rewritten.matchAll(/\/api\/stream\/[^"\s]+/g)).map((m) => m[0]);
    assert.strictEqual(hrefs.length, 3);
    const decoded = hrefs.map(decodeTarget).sort();
    assert.deepStrictEqual(decoded, [
      'https://cdn.test/path/audio/en.m3u8?token=a',
      'https://cdn.test/path/key.bin?sig=k',
      'https://cdn.test/path/segment-1.ts?sig=x',
    ]);
  });

  it('resolves relative children against the manifest URL, query string included', () => {
    const rewritten = rewriteHlsManifest(
      '#EXTM3U\nseg-1.ts?sig=x',
      'https://cdn.test/v/i.m3u8?k=1',
      toHref,
    );
    const href = rewritten.split('\n').find((line) => line.startsWith('/api/stream/'));
    assert.ok(href);
    assert.strictEqual(decodeTarget(href), 'https://cdn.test/v/seg-1.ts?sig=x');
  });

  it('leaves comments and attributes without URI= untouched', () => {
    const manifest = ['#EXTM3U', '#EXT-X-VERSION:3', '#EXT-X-TARGETDURATION:6'].join('\n');
    assert.strictEqual(
      rewriteHlsManifest(manifest, 'https://cdn.test/index.m3u8', toHref),
      manifest,
    );
  });
});

describe('rewriteDashManifest', () => {
  it('rewrites <BaseURL> and literal SegmentList URLs', () => {
    const manifest = [
      '<MPD>',
      '<BaseURL>https://cdn.test/dash/</BaseURL>',
      '<SegmentList><Initialization sourceURL="init.mp4"/><SegmentURL media="seg-1.m4s"/></SegmentList>',
      '</MPD>',
    ].join('\n');
    const rewritten = rewriteDashManifest(manifest, 'https://cdn.test/dash/manifest.mpd', toHref);
    assert.match(rewritten, /<BaseURL>\/api\/stream\/providerA\//);
    assert.match(rewritten, /sourceURL="\/api\/stream\/providerA\//);
    assert.match(rewritten, /media="\/api\/stream\/providerA\//);
    assert.strictEqual(
      decodeTarget(rewritten.match(/sourceURL="([^"]+)"/)?.[1] ?? ''),
      'https://cdn.test/dash/init.mp4',
    );
  });

  it('keeps a templated BaseURL a directory prefix so relative segments resolve', () => {
    const manifest = [
      '<MPD>',
      '<BaseURL>https://cdn.test/dash/</BaseURL>',
      '<SegmentTemplate media="chunk-$Number$.m4s" initialization="init-$RepresentationID$.mp4" />',
      '</MPD>',
    ].join('\n');
    const rewritten = rewriteDashManifest(manifest, 'https://cdn.test/dash/manifest.mpd', toHref);
    // placeholders are expanded by the DASH client, never by us
    assert.ok(rewritten.includes('media="chunk-$Number$.m4s"'));
    assert.ok(rewritten.includes('initialization="init-$RepresentationID$.mp4"'));
    const base = rewritten.match(/<BaseURL>([^<]+)<\/BaseURL>/)?.[1] ?? '';
    assert.ok(base.endsWith('/'), `expected directory prefix, got ${base}`);
    assert.strictEqual(decodeTarget(base), 'https://cdn.test/dash/');
  });

  it('detects padded and SubNumber template forms', () => {
    const manifest = [
      '<MPD><BaseURL>https://cdn.test/d/</BaseURL>',
      '<SegmentTemplate media="$SubNumber%05d$.m4s" /></MPD>',
    ].join('\n');
    const base = rewriteDashManifest(manifest, 'https://cdn.test/d/m.mpd', toHref).match(
      /<BaseURL>([^<]+)<\/BaseURL>/,
    )?.[1];
    assert.ok((base ?? '').endsWith('/'));
  });
});
