import { describe, expect, it } from 'vitest';
import { encodeBase64Url } from '@/lib/base64url';
import { providerContext } from '@/providers/_shared';
import { getProvider, providerRegistry } from '@/providers/registry';

const RUN_LIVE = process.env.RUN_LIVE === '1';
const DEPLOY_URL = process.env.DEPLOY_URL?.replace(/\/$/, '');
const TIMEOUT = Number(process.env.LIVE_PROVIDER_TIMEOUT_MS ?? 60_000);
const QUERY = process.env.LIVE_SEARCH_QUERY ?? 'dune';

/**
 * Playback only works if the *deployed* network can reach the provider CDN. Every
 * other live suite runs from the developer's machine, where it usually can — so
 * they pass while production is broken. This one asks the deployment itself.
 *
 *   RUN_LIVE=1 DEPLOY_URL=https://your-app.vercel.app pnpm test:providers
 */
describe.skipIf(!RUN_LIVE || !DEPLOY_URL)('deployed playback', () => {
  it(
    'serves a real provider URL through the deployed stream route',
    async () => {
      const providerId = Object.keys(providerRegistry)[0];
      const provider = getProvider(providerId);
      const search = provider.getSearchPosts?.bind(provider);
      if (!search) throw new Error(`${providerId} implements no search`);

      const ctx = providerContext;
      const signal = AbortSignal.timeout(TIMEOUT);
      const posts = await search({ query: QUERY, page: 1, signal, ctx });
      const post = posts[0];
      if (!post) throw new Error(`provider search returned nothing for "${QUERY}"`);

      const meta = await provider.getMeta({ link: post.link, signal, ctx });
      const playable = meta.linkList.flatMap((entry) => entry.directLinks ?? [])[0];
      if (!playable) throw new Error('provider returned no playable link');

      const streams = await provider.getStream({
        link: playable.link,
        type: meta.type === 'series' ? 'series' : 'movie',
        signal,
        ctx,
      });
      const stream = streams[0];
      if (!stream) throw new Error('provider returned no stream');

      const upstream = String(stream.link);
      const target = `${DEPLOY_URL}/api/stream/${encodeURIComponent(providerId)}/${encodeBase64Url(upstream)}`;
      const response = await fetch(target, {
        headers: { Range: 'bytes=0-2047', Cookie: 'haru-tz=UTC' },
        signal: AbortSignal.timeout(TIMEOUT),
      });

      if (response.status === 502) {
        const body = await response.text();
        throw new Error(
          `deployed route refused the provider CDN (502 ${body}). The deployment network ` +
            'cannot reach this CDN — read upstreamStatus in the function log. A CDN that refuses ' +
            'this network is an external block, not an app fault.',
        );
      }
      expect(
        [200, 206],
        `deployed route answered ${response.status} for a live provider URL`,
      ).toContain(response.status);
    },
    TIMEOUT,
  );
});
