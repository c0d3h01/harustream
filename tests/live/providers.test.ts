// ─── Live Provider API Smoke Tests ─────────────────────────────────────────
// Opt-in network suite that calls every endpoint of every registered provider
// against the real target sites, validating responses with the EXACT schemas
// the app uses (src/validations/provider.ts), so a broken or changed provider
// API surfaces as a test failure instead of a user-facing 500.
//
//   pnpm test:providers           # pretty live view (custom reporter)
//   RUN_LIVE=1 npx vitest run tests/live/providers.test.ts
//
// Each test reports what happened under the hood through its test meta
// (provider, endpoint, status, ms, detail) — rendered live by reporter.ts.
//
// Default `pnpm test` skips this suite: no network I/O unless RUN_LIVE=1.
// Env knobs (all optional):
//   RUN_LIVE=1               required — enables the suite
//   LIVE_PROVIDER_TIMEOUT_MS per-call budget (default 60000)
//   LIVE_SEARCH_QUERY        query used for getSearchPosts (default 'batman')
import { describe, expect, it } from 'vitest';
import { ProviderUnsupportedError } from '@/lib/errors';
import type { RawInfo, RawPost } from '@/providers/_shared';
import { createProviderContext, isProviderRetired } from '@/providers/_shared';
import { listProviders } from '@/providers/registry';
import {
  parseRaw,
  rawEpisodeSchema,
  rawInfoSchema,
  rawPostSchema,
  rawStreamSchema,
} from '@/validations/provider';

const RUN_LIVE = process.env.RUN_LIVE === '1';
const PER_CALL_TIMEOUT_MS = Number(process.env.LIVE_PROVIDER_TIMEOUT_MS ?? 60_000);
const SEARCH_QUERY = process.env.LIVE_SEARCH_QUERY ?? 'batman';

type HopResult<T> =
  | { status: 'ok'; data: T; ms: number }
  | { status: 'skipped'; reason: string; ms: number }
  | { status: 'error'; error: string; ms: number };

async function hop<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<HopResult<T>> {
  const started = Date.now();
  const signal = AbortSignal.timeout(PER_CALL_TIMEOUT_MS);
  let onAbort: (() => void) | undefined;
  const timedOut = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(new Error(`timed out after ${PER_CALL_TIMEOUT_MS}ms`));
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    const data = await Promise.race([fn(signal), timedOut]);
    return { status: 'ok', data, ms: Date.now() - started };
  } catch (error) {
    const ms = Date.now() - started;
    if (error instanceof ProviderUnsupportedError) {
      // Interactive-challenge flow is unavailable outside a real browser: an
      // environment limitation, not a broken endpoint — skip rather than fail.
      return { status: 'skipped', reason: error.message, ms };
    }
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    return { status: 'error', error: message, ms };
  } finally {
    if (onAbort) signal.removeEventListener('abort', onAbort);
  }
}

// Publish the hop outcome into the test meta so the custom reporter can draw
// the per-provider live view. Called as early as possible in each test body.
function track(
  meta: Record<string, unknown>,
  providerId: string,
  endpoint: string,
  result: HopResult<unknown>,
): void {
  meta.provider = providerId;
  meta.endpoint = endpoint;
  meta.status = result.status;
  meta.ms = result.ms;
  if (result.status === 'skipped') meta.detail = result.reason;
  if (result.status === 'error') meta.error = result.error;
}

function failOnError<T>(
  result: HopResult<T>,
  providerId: string,
  hopName: string,
): result is { status: 'ok'; data: T; ms: number } {
  if (result.status === 'error')
    throw new Error(`${providerId} ${hopName} failed: ${result.error}`);
  return result.status === 'ok';
}

describe.skipIf(!RUN_LIVE)('live provider API smoke', () => {
  for (const provider of listProviders()) {
    describe.skipIf(isProviderRetired(provider.id))(`live: ${provider.id}`, () => {
      const ctx = createProviderContext(provider.id);
      const testTimeoutMs = PER_CALL_TIMEOUT_MS + 2_000;

      let posts: RawPost[] = [];
      let meta: RawInfo | undefined;

      it(
        'getPosts resolves the first catalog rail',
        async ({ task }) => {
          const m = task.meta as Record<string, unknown>;
          const filter = provider.catalog[0]?.filter ?? '';
          const result = await hop((signal) => provider.getPosts({ filter, page: 1, signal, ctx }));
          track(m, provider.id, 'getPosts', result);
          if (result.status === 'skipped') return;
          if (!failOnError(result, provider.id, 'getPosts')) return;
          posts = parseRaw(rawPostSchema.array(), result.data, {
            provider: provider.id,
            op: 'live:getPosts',
          });
          m.detail = `${posts.length} post${posts.length === 1 ? '' : 's'} (filter=${filter || 'home'})`;
        },
        testTimeoutMs,
      );

      it(
        'getSearchPosts resolves the query',
        async ({ task }) => {
          const m = task.meta as Record<string, unknown>;
          const result = await hop((signal) =>
            provider.getSearchPosts({ query: SEARCH_QUERY, page: 1, signal, ctx }),
          );
          track(m, provider.id, 'getSearchPosts', result);
          if (result.status === 'skipped') return;
          if (!failOnError(result, provider.id, 'getSearchPosts')) return;
          const found = parseRaw(rawPostSchema.array(), result.data, {
            provider: provider.id,
            op: 'live:getSearchPosts',
          });
          m.detail = `${found.length} result${found.length === 1 ? '' : 's'} (query=${SEARCH_QUERY})`;
        },
        testTimeoutMs,
      );

      it(
        'getMeta resolves the first post link',
        async ({ task }) => {
          const m = task.meta as Record<string, unknown>;
          const link = posts[0]?.link;
          if (!link) {
            m.status = 'skipped';
            m.detail = 'no post link (getPosts produced nothing)';
            return;
          }
          const result = await hop((signal) => provider.getMeta({ link, signal, ctx }));
          track(m, provider.id, 'getMeta', result);
          if (result.status === 'skipped') return;
          if (!failOnError(result, provider.id, 'getMeta')) return;
          meta = parseRaw(rawInfoSchema, result.data, {
            provider: provider.id,
            op: 'live:getMeta',
          });
          m.detail = `${meta.type} · ${meta.linkList.length} link${meta.linkList.length === 1 ? '' : 's'} · ${link.slice(0, 72)}`;
        },
        testTimeoutMs,
      );

      it(
        'getEpisodes resolves a series link from metadata',
        async ({ task }) => {
          const m = task.meta as Record<string, unknown>;
          const getEpisodes = provider.getEpisodes;
          const seriesLink = meta?.linkList.find((entry) => entry.episodesLink)?.episodesLink;
          if (!getEpisodes || !seriesLink) {
            m.status = 'skipped';
            m.detail = getEpisodes
              ? 'no series episodes link in metadata'
              : 'provider has no getEpisodes';
            return;
          }
          const result = await hop((signal) => getEpisodes({ url: seriesLink, signal, ctx }));
          track(m, provider.id, 'getEpisodes', result);
          if (result.status === 'skipped') return;
          if (!failOnError(result, provider.id, 'getEpisodes')) return;
          const episodes = parseRaw(rawEpisodeSchema.array(), result.data, {
            provider: provider.id,
            op: 'live:getEpisodes',
          });
          m.detail = `${episodes.length} episode${episodes.length === 1 ? '' : 's'}`;
        },
        testTimeoutMs,
      );

      it(
        'getStream resolves sources for the first link',
        async ({ task }) => {
          const m = task.meta as Record<string, unknown>;
          // Mirror the app's ref resolution: providers address streams either
          // through an episodes link, or through a direct link payload (e.g.
          // anikoto's JSON {slug, epNum, dataIds}); the raw post link is the
          // last resort, only for providers exposing neither.
          const metaEntry = meta?.linkList.find((entry) => entry.episodesLink) ?? meta?.linkList[0];
          const link =
            metaEntry?.episodesLink ?? metaEntry?.directLinks?.[0]?.link ?? posts[0]?.link;
          if (!link) {
            m.status = 'skipped';
            m.detail = 'no link (upstream produced nothing)';
            return;
          }
          const kind = meta?.type === 'series' ? 'series' : 'movie';
          const result = await hop((signal) =>
            provider.getStream({ link, type: kind, signal, ctx }),
          );
          track(m, provider.id, 'getStream', result);
          if (result.status === 'skipped') return;
          if (!failOnError(result, provider.id, 'getStream')) return;
          const streams = parseRaw(rawStreamSchema.array(), result.data, {
            provider: provider.id,
            op: 'live:getStream',
          });
          const formats = [...new Set(streams.map((s) => s.type.toLowerCase()))].join('/');
          m.detail = `${streams.length} source${streams.length === 1 ? '' : 's'}${formats ? ` (${formats})` : ''}`;
        },
        testTimeoutMs,
      );

      it(
        'getSettingsSchema is usable',
        async ({ task }) => {
          const m = task.meta as Record<string, unknown>;
          const getSettingsSchema = provider.getSettingsSchema;
          if (!getSettingsSchema) {
            m.status = 'skipped';
            m.detail = 'provider has no getSettingsSchema';
            return;
          }
          const result = await hop(() => getSettingsSchema({ ctx }));
          track(m, provider.id, 'getSettingsSchema', result);
          if (result.status === 'skipped') return;
          if (!failOnError(result, provider.id, 'getSettingsSchema')) return;
          const settings = result.data;
          const invalid = settings.filter(
            (field) => typeof field.key !== 'string' || typeof field.label !== 'string',
          ).length;
          expect(invalid).toBe(0);
          m.detail = `${settings.length} field${settings.length === 1 ? '' : 's'}`;
        },
        testTimeoutMs,
      );
    });
  }
});
