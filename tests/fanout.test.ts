import { describe, expect, it } from 'vitest';
import { AppError } from '@/lib/errors';
import type { ProviderModule } from '@/providers/_shared';
import { runFanout } from '@/services/fanout';

const provider = (id: string, work: (signal: AbortSignal) => Promise<string>): ProviderModule =>
  ({
    id,
    name: id,
    kind: 'global',
    catalog: [],
    genres: [],
    getPosts: async () => [],
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
        const posts = await entry.getSearchPosts({ query: 'x', page: 1, signal, ctx: {} as never });
        return titleFromPosts(posts);
      },
    );
    expect(result.find((item) => item.provider.id === 'good')?.value).toBe('ok');
    expect(result.find((item) => item.provider.id === 'bad')?.error).toBeDefined();
  });

  it('aborts an in-flight provider when the global deadline expires', async () => {
    const previous = {
      concurrency: process.env.PROVIDER_CONCURRENCY,
      timeout: process.env.PROVIDER_TIMEOUT_MS,
      deadline: process.env.PROVIDER_DEADLINE_MS,
    };
    process.env.PROVIDER_CONCURRENCY = '1';
    process.env.PROVIDER_TIMEOUT_MS = '500';
    process.env.PROVIDER_DEADLINE_MS = '30';

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
        async (entry, signal) => {
          const posts = await entry.getSearchPosts({
            query: 'x',
            page: 1,
            signal,
            ctx: {} as never,
          });
          return titleFromPosts(posts);
        },
      );

      expect(Date.now() - startedAt).toBeLessThan(300);
      expect(result[0]?.error?.name).toBe('ProviderTimeoutError');
    } finally {
      if (previous.concurrency === undefined) delete process.env.PROVIDER_CONCURRENCY;
      else process.env.PROVIDER_CONCURRENCY = previous.concurrency;
      if (previous.timeout === undefined) delete process.env.PROVIDER_TIMEOUT_MS;
      else process.env.PROVIDER_TIMEOUT_MS = previous.timeout;
      if (previous.deadline === undefined) delete process.env.PROVIDER_DEADLINE_MS;
      else process.env.PROVIDER_DEADLINE_MS = previous.deadline;
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
        const posts = await entry.getSearchPosts({ query: 'x', page: 1, signal, ctx: {} as never });
        return titleFromPosts(posts);
      },
    );

    expect(result.map((item) => item.provider.id)).toEqual(['first', 'second', 'third']);
    expect(result.map((item) => item.value)).toEqual(['first', 'second', 'third']);
  });

  it('does not classify a caller abort as a provider timeout', async () => {
    const caller = new AbortController();
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
        const posts = await entry.getSearchPosts({ query: 'x', page: 1, signal, ctx: {} as never });
        return titleFromPosts(posts);
      },
      caller.signal,
    );
    caller.abort();

    const result = await resultPromise;
    const error = result[0]?.error;
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe('UPSTREAM');
  });
});
