import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { AppError } from '@/lib/errors';
import type { ProviderModule } from '@/providers/_shared';
import { runFanout } from '@/services/fanout';

const provider = (id: string, work: (signal: AbortSignal) => Promise<string>): ProviderModule =>
  ({
    id,
    name: id,
    getSearchPosts: async ({ signal }) => [
      { title: await work(signal ?? new AbortController().signal), link: id, image: '' },
    ],
    getMeta: async () => ({
      title: id,
      image: '',
      synopsis: '',
      imdbId: '',
      type: 'movie',
      linkList: [],
    }),
    getStream: async () => [],
  }) as ProviderModule;

const firstTitle = async (entry: ProviderModule, signal: AbortSignal): Promise<string> => {
  const search = entry.getSearchPosts;
  if (!search) throw new Error('fixture provider has no search');
  return titleFromPosts(await search({ query: 'x', page: 1, signal, ctx: {} as never }));
};

const titleFromPosts = (posts: Array<{ title: string }>): string => {
  const post = posts[0];
  if (!post) throw new Error('Provider returned no posts');
  return post.title;
};

describe('fan-out resilience', () => {
  it('degrades one provider failure without failing peers', async () => {
    const result = await runFanout(
      [
        provider('good', async () => 'ok'),
        provider('bad', async () => {
          throw new Error('broken');
        }),
      ],
      async (entry, signal) => {
        return firstTitle(entry, signal);
      },
    );
    assert.strictEqual(result.find((item) => item.provider.id === 'good')?.value, 'ok');
    assert.ok(result.find((item) => item.provider.id === 'bad')?.error !== undefined);
  });

  it('aborts an in-flight provider when the provider timeout expires', async () => {
    const previous = process.env.PROVIDER_TIMEOUT_MS;
    process.env.PROVIDER_TIMEOUT_MS = '50';

    try {
      const startedAt = Date.now();
      const result = await runFanout(
        [
          provider('slow', async (signal) => {
            return await new Promise<string>((_, reject) => {
              signal.addEventListener(
                'abort',
                () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
                { once: true },
              );
            });
          }),
        ],
        async (entry, signal) => firstTitle(entry, signal),
      );

      assert.ok(Date.now() - startedAt < 300);
      assert.strictEqual(result[0]?.error?.name, 'ProviderTimeoutError');
    } finally {
      if (previous === undefined) delete process.env.PROVIDER_TIMEOUT_MS;
      else process.env.PROVIDER_TIMEOUT_MS = previous;
    }
  });

  it('preserves provider input order when operations finish out of order', async () => {
    const result = await runFanout(
      [
        provider('first', async () => {
          await new Promise((resolve) => setTimeout(resolve, 40));
          return 'first';
        }),
        provider('second', async () => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          return 'second';
        }),
        provider('third', async () => {
          await new Promise((resolve) => setTimeout(resolve, 20));
          return 'third';
        }),
      ],
      async (entry, signal) => {
        return firstTitle(entry, signal);
      },
    );

    assert.deepStrictEqual(
      result.map((item) => item.provider.id),
      ['first', 'second', 'third'],
    );
    assert.deepStrictEqual(
      result.map((item) => item.value),
      ['first', 'second', 'third'],
    );
  });

  it('does not classify a caller abort as a provider timeout', async () => {
    const controller = new AbortController();
    const resultPromise = runFanout(
      [
        provider('cancelled', async (signal) => {
          await new Promise<void>((_, reject) => {
            signal.addEventListener(
              'abort',
              () => reject(Object.assign(new Error('client disconnected'), { name: 'AbortError' })),
              { once: true },
            );
          });
          return 'cancelled';
        }),
      ],
      async (entry, signal) => {
        return firstTitle(entry, signal);
      },
      controller.signal,
    );
    controller.abort();

    const result = await resultPromise;
    const error = result[0]?.error;
    assert.ok(error instanceof AppError);
    assert.strictEqual((error as AppError).code, 'UPSTREAM');
  });
});
