import { afterEach, describe, expect, it, vi } from 'vitest';
import { manifestKind, rewriteDashManifest, rewriteHlsManifest } from '@/lib/streaming/manifestRewriter';
import { verifyProxyToken } from '@/lib/streaming/token';

const ctx = {
  variant: { mediaId: 'media1', providerId: 'providerA', variantId: 'variant1' },
  headers: { referer: 'https://provider.test' },
  ttlMs: 60_000,
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('manifestKind', () => {
  it('classifies by extension and content-type', () => {
    expect(manifestKind(null, 'https://cdn.test/master.m3u8?x=1')).toBe('hls');
    expect(manifestKind('application/dash+xml', 'https://cdn.test/x')).toBe('dash');
    expect(manifestKind('video/mp4', 'https://cdn.test/video.mp4')).toBe(null);
  });
});

describe('rewriteHlsManifest', () => {
  it('rewrites URI attributes and bare segment/sub-playlist lines to proxy paths', async () => {
    const manifest = [
      '#EXTM3U',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",URI="audio/en.m3u8?token=a"',
      '#EXT-X-KEY:METHOD=AES-128,URI="key.bin?sig=k",IV=0x1',
      '#EXTINF:6,',
      'segment-1.ts?sig=x',
    ].join('\n');
    const rewritten = await rewriteHlsManifest(manifest, 'https://cdn.test/path/master.m3u8?manifest=signed', ctx);

    expect(rewritten).toContain('IV=0x1');
    const paths = Array.from(rewritten.matchAll(/\/api\/proxy\/[^"\s]+/g)).map((match) => match[0]);
    expect(paths).toHaveLength(3);
    for (const path of paths) {
      const [, , , mediaId, providerId, variantId, kind, chunkIdWithQuery] = path.split('/');
      expect(mediaId).toBe('media1');
      expect(providerId).toBe('providerA');
      expect(variantId).toBe('variant1');
      expect(['manifest', 'binary']).toContain(kind);
      expect(chunkIdWithQuery).toMatch(/^[0-9a-f]{16}\?exp=\d+&token=/);
    }
  });

  it('produces a token that verifies against its own path (round-trips through the real route contract)', async () => {
    const manifest = '#EXTM3U\nsegment-1.ts';
    const rewritten = await rewriteHlsManifest(manifest, 'https://cdn.test/video/index.m3u8', ctx);
    const href = rewritten.split('\n').find((line) => line.startsWith('/api/proxy/'));
    expect(href).toBeDefined();
    const url = new URL(href as string, 'https://app.test');
    const [, , , mediaId, providerId, variantId, kind, chunkId] = url.pathname.split('/');
    const token = url.searchParams.get('token');
    expect(token).toBeTruthy();
    const path = `${mediaId}/${providerId}/${variantId}/${kind}/${chunkId}`;
    const payload = await verifyProxyToken(token as string, path);
    expect(payload?.url).toBe('https://cdn.test/video/segment-1.ts');
    expect(payload?.headers).toMatchObject({ referer: 'https://provider.test' });
  });

  it('excludes the upstream query string from the chunk id so the same segment path hashes identically across resolutions', async () => {
    const first = await rewriteHlsManifest('#EXTM3U\nsegment-1.ts?sig=aaa', 'https://cdn.test/v/index.m3u8', ctx);
    const second = await rewriteHlsManifest('#EXTM3U\nsegment-1.ts?sig=bbb', 'https://cdn.test/v/index.m3u8', ctx);
    const chunkIdOf = (manifest: string) => manifest.match(/\/binary\/([0-9a-f]{16})\?/)?.[1];
    expect(chunkIdOf(first)).toBe(chunkIdOf(second));
  });

  it('leaves comments and attributes without URI= untouched', async () => {
    const manifest = ['#EXTM3U', '#EXT-X-VERSION:3', '#EXT-X-TARGETDURATION:6'].join('\n');
    const rewritten = await rewriteHlsManifest(manifest, 'https://cdn.test/index.m3u8', ctx);
    expect(rewritten).toBe(manifest);
  });
});

describe('rewriteDashManifest', () => {
  it('rewrites <BaseURL> and literal SegmentList URLs', async () => {
    const manifest = [
      '<MPD>',
      '<BaseURL>https://cdn.test/dash/</BaseURL>',
      '<SegmentList><Initialization sourceURL="init.mp4"/><SegmentURL media="seg-1.m4s"/></SegmentList>',
      '</MPD>',
    ].join('\n');
    const rewritten = await rewriteDashManifest(manifest, 'https://cdn.test/dash/manifest.mpd', ctx);
    expect(rewritten).toContain('<BaseURL>/api/proxy/media1/providerA/variant1/');
    expect(rewritten).toMatch(/sourceURL="\/api\/proxy\/media1\/providerA\/variant1\//);
    expect(rewritten).toMatch(/media="\/api\/proxy\/media1\/providerA\/variant1\//);
  });

  it('rewrites a SegmentTemplate manifest into a token-bound BaseURL prefix instead of per-segment hrefs', async () => {
    const manifest = [
      '<MPD>',
      '<BaseURL>https://cdn.test/dash/</BaseURL>',
      '<SegmentTemplate media="chunk-$Number$.m4s" initialization="init-$RepresentationID$.mp4" />',
      '</MPD>',
    ].join('\n');
    const rewritten = await rewriteDashManifest(manifest, 'https://cdn.test/dash/manifest.mpd', ctx);
    // The template placeholders must survive untouched — they're expanded
    // by the DASH client, not by us.
    expect(rewritten).toContain('media="chunk-$Number$.m4s"');
    expect(rewritten).toContain('initialization="init-$RepresentationID$.mp4"');
    const base = rewritten.match(/<BaseURL>([^<]+)<\/BaseURL>/)?.[1];
    expect(base).toMatch(/^\/api\/proxy\/media1\/providerA\/variant1\/binary\/template\/[^/]+\/$/);
  });
});
