import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StreamSource } from '@/types';

vi.mock('@/services/sources', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/sources')>();
  return { ...actual, sources: vi.fn() };
});

import { GET } from '@/app/api/proxy/route';
import { clearProxyIdentityCache } from '@/lib/media/streamProxy';
import { sources } from '@/services/sources';

const mockedSources = vi.mocked(sources);

const streamSource = (id: string, url: string, format: StreamSource['format']): StreamSource => ({
  id,
  providerId: 'test',
  label: id,
  url,
  format,
  quality: '1080',
  subtitles: [],
});

const proxyUrl = (sourceId?: string): string => {
  const params = new URLSearchParams({ provider: 'test', ref: 'R', kind: 'movie' });
  if (sourceId) params.set('sourceId', sourceId);
  return `http://app.test/api/proxy?${params.toString()}`;
};

const upstream = (status: number) =>
  new Response('media-bytes', {
    status,
    headers: {
      'content-type': status === 206 ? 'video/mp4' : 'video/mp4',
      ...(status === 206
        ? {
            'content-range': 'bytes 0-1024/461874767',
            'content-length': '1025',
            'accept-ranges': 'bytes',
          }
        : { 'content-length': '11' }),
    },
  });

afterEach(() => {
  clearProxyIdentityCache();
  mockedSources.mockReset();
  vi.unstubAllGlobals();
});

describe('/api/proxy (resolve-and-stream mode)', () => {
  it('forwards the video element Range header to the upstream fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(upstream(206));
    vi.stubGlobal('fetch', fetchMock);
    mockedSources.mockResolvedValue([
      streamSource('test:mp4', 'https://cdn.test/video.mp4?sig=1', 'mp4'),
    ]);

    const response = await GET(
      new Request(proxyUrl(encodeURIComponent('test:mp4')), {
        headers: { Range: 'bytes=0-1048575' },
      }),
    );

    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe('bytes 0-1024/461874767');
    const [, init] = fetchMock.mock.calls[0];
    expect(new Headers(init?.headers).get('Range')).toBe('bytes=0-1048575');
  });

  it('streams a fresh progressive fallback instead of 404 when the sourceId went stale', async () => {
    const fetchMock = vi.fn().mockResolvedValue(upstream(200));
    vi.stubGlobal('fetch', fetchMock);
    // The player requested test:mp4-1080, but a re-scrape rotated the signed
    // URLs and that id no longer exists in the fresh list.
    mockedSources.mockResolvedValue([
      streamSource('test:mpd', 'https://cdn.test/play.mpd?q=1', 'mpd'),
      streamSource('test:mp4-1080', 'https://cdn.test/a.mp4?s=2', 'mp4'),
    ]);

    const response = await GET(new Request(proxyUrl(encodeURIComponent('test:mp4-1080'))));

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // The DASH manifest is skipped; the progressive a.mp4 is streamed.
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://cdn.test/a.mp4?s=2');
  });

  it('returns NOT_FOUND only when no stream source is available at all', async () => {
    mockedSources.mockResolvedValue([]);
    const response = await GET(new Request(proxyUrl(encodeURIComponent('test:gone'))));
    expect(response.status).toBe(404);
  });
});
