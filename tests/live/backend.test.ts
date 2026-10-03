import { describe, expect, it } from 'vitest';
import { providerContext } from '@/providers/_shared';
import { listProviders } from '@/providers/registry';
import { rawPostSchema } from '@/validations/provider';

const LIVE = process.env.RUN_LIVE === '1';
const SUITE = LIVE ? describe : describe.skip;

const base = (process.env.DEPLOY_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const ctx = providerContext;

const statuses: string[] = [];
function record(route: string, status: number) {
  statuses.push(`${route} -> ${status}`);
}

async function hit(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${base}${path}`, init);
  record(path, res.status);
  return res;
}

/** First provider plus a live ref that actually exists, so the downstream checks are real. */
async function liveRef(): Promise<{ providerId: string; ref: string }> {
  const provider = listProviders()[0];
  if (!provider?.getSearchPosts) throw new Error('no provider with getSearchPosts registered');
  const posts = rawPostSchema
    .array()
    .parse(await provider.getSearchPosts({ query: 'harry', page: 1, signal: undefined, ctx }));
  const first = posts[0];
  if (!first) throw new Error(`${provider.id} returned no posts for the probe query`);
  return { providerId: provider.id, ref: first.link };
}

SUITE('live backend', () => {
  it('GET /api/media returns a Media for a live ref', async () => {
    const { providerId, ref } = await liveRef();
    const res = await hit(
      `/api/media?provider=${encodeURIComponent(providerId)}&ref=${encodeURIComponent(ref)}`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.displayTitle).toBeTruthy();
  });

  it('GET /api/episodes returns an array', async () => {
    const { providerId, ref } = await liveRef();
    const res = await hit(
      `/api/episodes?provider=${encodeURIComponent(providerId)}&ref=${encodeURIComponent(ref)}`,
    );
    expect(res.status).toBe(200);
    expect(Array.isArray(await res.json())).toBe(true);
  });

  it('GET /api/sources returns variants whose playbackHref points at /api/stream', async () => {
    const { providerId, ref } = await liveRef();
    const res = await hit(
      `/api/sources?provider=${encodeURIComponent(providerId)}&ref=${encodeURIComponent(ref)}`,
    );
    if (res.status !== 200) {
      // Distinguish "our proxy is broken" from "the provider's stream endpoint is
      // down/returning non-JSON". The provider error body says which.
      const body = await res.text();
      throw new Error(
        `sources failed for ${providerId} (status ${res.status}). ` +
          `If code=PROVIDER_ERROR the provider's getStream is failing upstream ` +
          `(provider-side), not the proxy. Body: ${body.slice(0, 200)}`,
      );
    }
    const variants = await res.json();
    expect(Array.isArray(variants)).toBe(true);
    for (const variant of variants) {
      expect(variant.playbackHref, 'playbackHref must route back through /api/stream').toMatch(
        /^\/api\/stream\//,
      );
      for (const subtitle of variant.subtitles ?? []) {
        expect(subtitle.href).toMatch(/^\/api\/stream\//);
      }
    }
  });

  it('GET <playbackHref> serves media or a manifest, not error JSON', async () => {
    const { providerId, ref } = await liveRef();
    const sourcesRes = await hit(
      `/api/sources?provider=${encodeURIComponent(providerId)}&ref=${encodeURIComponent(ref)}`,
    );
    const variants = await sourcesRes.json();
    const target = variants?.[0]?.playbackHref as string | undefined;
    if (!target) {
      // No variant is a provider-content fact, not a proxy failure.
      expect(sourcesRes.status).toBe(200);
      return;
    }
    const res = await hit(target);
    expect([200, 206]).toContain(res.status);
    const contentType = res.headers.get('content-type') ?? '';
    expect(contentType).not.toContain('application/json');
  });

  it('GET /api/stream with no path answers 400 BAD_REQUEST', async () => {
    const res = await hit('/api/stream');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('BAD_REQUEST');
  });

  it('GET /api/resolve returns candidates for a real title', async () => {
    const res = await hit('/api/resolve?title=Harry');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.candidates)).toBe(true);
  });

  it.runIf(process.env.TMDB_API_KEY)('GET /api/tmdb/rail returns trending cards', async () => {
    const res = await hit('/api/tmdb/rail/movie/trending');
    expect(res.status).toBe(200);
    expect(Array.isArray(await res.json())).toBe(true);
  });

  it('two concurrent /api/sources calls both succeed with equal bodies', async () => {
    const { providerId, ref } = await liveRef();
    const url = `/api/sources?provider=${encodeURIComponent(providerId)}&ref=${encodeURIComponent(ref)}`;
    const [a, b] = await Promise.all([hit(url), hit(url)]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    await expect(a.json()).resolves.toEqual(await b.json());
  });

  it('reports every status it observed', () => {
    // Printed so the gate report carries literal statuses, not just pass/fail.
    console.log(`\n[live backend] ${base}\n${statuses.join('\n')}`);
    expect(statuses.length).toBeGreaterThan(0);
  });
});
