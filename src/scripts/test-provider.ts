#!/usr/bin/env node
/**
 * Provider Tester
 * 
 * Tests all provider methods: getPosts, getSearchPosts, getMeta, getEpisodes, getStream, getSettingsSchema
 * 
 * Usage:
 *   npx tsx src/scripts/test-provider.ts <providerId> [method]
 *   npx tsx src/scripts/test-provider.ts hiAnime
 *   npx tsx src/scripts/test-provider.ts vega getStream
 *   npx tsx src/scripts/test-provider.ts --all
 */

import { createProviderContext } from '../providers/_shared';
import { getProvider, listProviders } from '../providers/registry';
import type { ProviderModule, ProviderContext } from '../providers/_shared';

interface TestResult {
  method: string;
  success: boolean;
  duration: number;
  data?: any;
  error?: string;
}

interface TestOptions {
  providerId: string;
  method?: string;
  verbose?: boolean;
  timeout?: number;
}

function createTimeoutSignal(timeout: number): AbortSignal {
  const controller = new AbortController();
  let aborted = false;
  const id = setTimeout(() => {
    if (!aborted) {
      aborted = true;
      controller.abort();
    }
  }, timeout);
  // Clean up timeout if signal is aborted by other means
  controller.signal.addEventListener('abort', () => {
    if (!aborted) {
      aborted = true;
      clearTimeout(id);
    }
  }, { once: true });
  return controller.signal;
}

const DEFAULT_TIMEOUT = 60000;

function createTestContext(providerId: string): ProviderContext {
  const baseContext = createProviderContext(providerId);
  // Override axios with longer timeout for testing
  return {
    ...baseContext,
    axios: baseContext.axios.create({ timeout: 60_000 }),
  };
}

async function testGetPosts(provider: ProviderModule, ctx: ProviderContext, verbose: boolean): Promise<TestResult> {
  const start = Date.now();
  try {
    // Test with first catalog filter or empty string
    const filter = provider.catalog[0]?.filter || '';
    const result = await provider.getPosts({
      filter,
      page: 1,
      signal: createTimeoutSignal(DEFAULT_TIMEOUT),
      ctx,
    });
    return {
      method: 'getPosts',
      success: true,
      duration: Date.now() - start,
      data: { count: result.length, filter, firstItem: result[0] },
    };
  } catch (error) {
    return {
      method: 'getPosts',
      success: false,
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function testGetSearchPosts(provider: ProviderModule, ctx: ProviderContext, verbose: boolean): Promise<TestResult> {
  const start = Date.now();
  try {
    const result = await provider.getSearchPosts({
      query: 'naruto',
      page: 1,
      signal: createTimeoutSignal(DEFAULT_TIMEOUT),
      ctx,
    });
    return {
      method: 'getSearchPosts',
      success: true,
      duration: Date.now() - start,
      data: { count: result.length, firstItem: result[0] },
    };
  } catch (error) {
    return {
      method: 'getSearchPosts',
      success: false,
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function testGetMeta(provider: ProviderModule, ctx: ProviderContext, verbose: boolean): Promise<TestResult> {
  const start = Date.now();
  try {
    // First get a post to have a valid link
    const posts = await provider.getPosts({
      filter: provider.catalog[0]?.filter || '',
      page: 1,
      signal: createTimeoutSignal(DEFAULT_TIMEOUT),
      ctx,
    });
    
    if (posts.length === 0) {
      return {
        method: 'getMeta',
        success: false,
        duration: Date.now() - start,
        error: 'No posts available to test getMeta',
      };
    }

    const result = await provider.getMeta({
      link: posts[0].link,
      signal: createTimeoutSignal(DEFAULT_TIMEOUT),
      ctx,
    });
    return {
      method: 'getMeta',
      success: true,
      duration: Date.now() - start,
      data: {
        title: result.title,
        type: result.type,
        linkCount: result.linkList.length,
        hasImage: !!result.image,
        hasSynopsis: !!result.synopsis,
      },
    };
  } catch (error) {
    return {
      method: 'getMeta',
      success: false,
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function testGetEpisodes(provider: ProviderModule, ctx: ProviderContext, verbose: boolean): Promise<TestResult> {
  const start = Date.now();
  try {
    if (!provider.getEpisodes) {
      return {
        method: 'getEpisodes',
        success: true,
        duration: Date.now() - start,
        data: { skipped: true, reason: 'Provider does not support episodes' },
      };
    }

    const posts = await provider.getPosts({
      filter: provider.catalog[0]?.filter || '',
      page: 1,
      signal: createTimeoutSignal(DEFAULT_TIMEOUT),
      ctx,
    });
    
    if (posts.length === 0) {
      return {
        method: 'getEpisodes',
        success: false,
        duration: Date.now() - start,
        error: 'No posts available to test getEpisodes',
      };
    }

    // Get meta first to get episode link
    const meta = await provider.getMeta({
      link: posts[0].link,
      signal: createTimeoutSignal(DEFAULT_TIMEOUT),
      ctx,
    });
    
    if (meta.type !== 'series' || meta.linkList.length === 0) {
      return {
        method: 'getEpisodes',
        success: true,
        duration: Date.now() - start,
        data: { skipped: true, reason: 'Not a series or no episode links' },
      };
    }

    const episodeLink = meta.linkList[0].episodesLink || meta.linkList[0].directLinks?.[0]?.link;
    if (!episodeLink) {
      return {
        method: 'getEpisodes',
        success: false,
        duration: Date.now() - start,
        error: 'No episode link found in meta',
      };
    }

    const result = await provider.getEpisodes({
      url: episodeLink,
      signal: createTimeoutSignal(DEFAULT_TIMEOUT),
      ctx,
    });
    return {
      method: 'getEpisodes',
      success: true,
      duration: Date.now() - start,
      data: { count: result.length, firstItem: result[0] },
    };
  } catch (error) {
    return {
      method: 'getEpisodes',
      success: false,
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function testGetStream(provider: ProviderModule, ctx: ProviderContext, verbose: boolean): Promise<TestResult> {
  const start = Date.now();
  try {
    const posts = await provider.getPosts({
      filter: provider.catalog[0]?.filter || '',
      page: 1,
      signal: createTimeoutSignal(DEFAULT_TIMEOUT),
      ctx,
    });
    
    if (posts.length === 0) {
      return {
        method: 'getStream',
        success: false,
        duration: Date.now() - start,
        error: 'No posts available to test getStream',
      };
    }

    const meta = await provider.getMeta({
      link: posts[0].link,
      signal: createTimeoutSignal(DEFAULT_TIMEOUT),
      ctx,
    });
    
    let streamLink: string;
    if (meta.type === 'series' && meta.linkList.length > 0) {
      const episodeLink = meta.linkList[0].episodesLink || meta.linkList[0].directLinks?.[0]?.link;
      if (!episodeLink) {
        return {
          method: 'getStream',
          success: false,
          duration: Date.now() - start,
          error: 'No episode/stream link found',
        };
      }
      
      const episodes = await provider.getEpisodes({
        url: episodeLink,
        signal: createTimeoutSignal(DEFAULT_TIMEOUT),
        ctx,
      });
      
      if (episodes.length === 0) {
        return {
          method: 'getStream',
          success: false,
          duration: Date.now() - start,
          error: 'No episodes found',
        };
      }
      streamLink = episodes[0].link;
    } else {
      // Movie - use first link
      const movieLink = meta.linkList[0]?.directLinks?.[0]?.link || meta.linkList[0]?.link;
      if (!movieLink) {
        return {
          method: 'getStream',
          success: false,
          duration: Date.now() - start,
          error: 'No stream link found',
        };
      }
      streamLink = movieLink;
    }

    const result = await provider.getStream({
      link: streamLink,
      type: meta.type,
      signal: createTimeoutSignal(DEFAULT_TIMEOUT),
      ctx,
    });
    return {
      method: 'getStream',
      success: true,
      duration: Date.now() - start,
      data: { 
        count: result.length, 
        servers: result.map(s => s.server).slice(0, 5),
        types: [...new Set(result.map(s => s.type))],
      },
    };
  } catch (error) {
    return {
      method: 'getStream',
      success: false,
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function testGetSettingsSchema(provider: ProviderModule, ctx: ProviderContext, verbose: boolean): Promise<TestResult> {
  const start = Date.now();
  try {
    if (!provider.getSettingsSchema) {
      return {
        method: 'getSettingsSchema',
        success: true,
        duration: Date.now() - start,
        data: { skipped: true, reason: 'Provider does not have settings schema' },
      };
    }

    const result = await provider.getSettingsSchema({ ctx });
    return {
      method: 'getSettingsSchema',
      success: true,
      duration: Date.now() - start,
      data: { count: result.length, settings: result.map(s => s.key) },
    };
  } catch (error) {
    return {
      method: 'getSettingsSchema',
      success: false,
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runTests(options: TestOptions): Promise<void> {
  const { providerId, method, verbose = false } = options;
  
  console.log(`\n🔍 Testing provider: ${providerId}`);
  console.log('='.repeat(50));
  
  let provider: ProviderModule;
  try {
    provider = getProvider(providerId);
  } catch (error) {
    console.error(`❌ Provider not found: ${providerId}`);
    console.log('\nAvailable providers:');
    listProviders().forEach(p => console.log(`  - ${p.id} (${p.name}) [${p.kind}]`));
    process.exit(1);
  }

  console.log(`Provider: ${provider.name} (${provider.id})`);
  console.log(`Kind: ${provider.kind}`);
  console.log(`Catalog items: ${provider.catalog.length}`);
  console.log(`Genres: ${provider.genres.length}`);
  console.log(`Has getEpisodes: ${!!provider.getEpisodes}`);
  console.log(`Has getSettingsSchema: ${!!provider.getSettingsSchema}`);
  console.log('');

  const ctx = createTestContext(providerId);
  const results: TestResult[] = [];

  const tests = [
    { name: 'getPosts', fn: testGetPosts, required: true },
    { name: 'getSearchPosts', fn: testGetSearchPosts, required: true },
    { name: 'getMeta', fn: testGetMeta, required: true },
    { name: 'getEpisodes', fn: testGetEpisodes, required: provider.kind !== 'movies' },
    { name: 'getStream', fn: testGetStream, required: true },
    { name: 'getSettingsSchema', fn: testGetSettingsSchema, required: false },
  ];

  for (const test of tests) {
    if (method && test.name !== method) continue;
    if (!test.required && !provider[test.name as keyof ProviderModule]) {
      if (verbose) console.log(`⏭️  Skipping ${test.name} (not implemented)`);
      continue;
    }

    if (verbose) console.log(`\n📋 Running ${test.name}...`);
    
    const result = await test.fn(provider, ctx, verbose);
    results.push(result);

    const status = result.success ? '✅' : '❌';
    const duration = `${result.duration}ms`;
    console.log(`${status} ${test.name} (${duration})`);
    
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
    if (result.data && verbose) {
      console.log(`   Data: ${JSON.stringify(result.data, null, 2)}`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 SUMMARY');
  console.log('='.repeat(50));
  
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const skipped = results.filter(r => r.data?.skipped).length;
  
  results.forEach(r => {
    const status = r.success ? (r.data?.skipped ? '⏭️' : '✅') : '❌';
    console.log(`${status} ${r.method.padEnd(20)} ${r.duration}ms ${r.error ? `- ${r.error}` : ''}`);
  });
  
  console.log(`\nTotal: ${results.length} | Passed: ${passed} | Failed: ${failed} | Skipped: ${skipped}`);
  
  if (failed > 0) {
    process.exit(1);
  }
}

async function runAllProviders(): Promise<void> {
  const providers = listProviders();
  console.log(`\n🧪 Testing ALL providers (${providers.length} total)\n`);
  
  // Run in batches of 5 with 30s timeout each
  const BATCH_SIZE = 5;
  const allResults: { providerId: string; results: TestResult[] }[] = [];
  
  for (let i = 0; i < providers.length; i += BATCH_SIZE) {
    const batch = providers.slice(i, i + BATCH_SIZE);
    console.log(`\n📦 Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(providers.length / BATCH_SIZE)} (${batch.length} providers)`);
    
    const batchResults = await Promise.allSettled(
      batch.map(async (provider) => {
        const ctx = createProviderContext(provider.id);
        const testCtx = {
          ...ctx,
          axios: ctx.axios.create({ timeout: 30_000 }),
        };
        
        try {
          const start = Date.now();
          const posts = await provider.getPosts({
            filter: provider.catalog[0]?.filter || '',
            page: 1,
            ctx: testCtx,
          });
          return {
            providerId: provider.id,
            results: [{
              method: 'getPosts',
              success: true,
              duration: Date.now() - start,
              data: { count: posts.length },
            }],
          };
        } catch (error) {
          return {
            providerId: provider.id,
            results: [{
              method: 'getPosts',
              success: false,
              duration: Date.now() - start,
              error: error instanceof Error ? error.message : String(error),
            }],
          };
        }
      })
    );
    
    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        allResults.push(result.value);
      } else {
        console.error(`Batch error:`, result.reason);
      }
    }
  }
  
  // Print summary table
  console.log('\n' + '='.repeat(80));
  console.log('📊 ALL PROVIDERS SUMMARY');
  console.log('='.repeat(80));
  
  console.log('\nProvider'.padEnd(20) + 'Status'.padEnd(10) + 'Duration' + ' Details');
  console.log('-'.repeat(80));
  
  for (const { providerId, results } of allResults) {
    const r = results[0];
    const status = r.success ? '✅ PASS' : '❌ FAIL';
    const details = r.error ? ` - ${r.error.substring(0, 50)}` : ` - ${r.data?.count || 0} items`;
    console.log(`${providerId.padEnd(20)} ${status.padEnd(10)} ${String(r.duration).padStart(6)}ms${details}`);
  }
  
  const total = allResults.length;
  const passed = allResults.filter(r => r.results[0]?.success).length;
  console.log(`\nTotal: ${total} | Passed: ${passed} | Failed: ${total - passed}`);
}

function parseArgs(): TestOptions | { all: true } {
  const args = process.argv.slice(2);
  
  if (args.includes('--all') || args.includes('-a')) {
    return { all: true };
  }
  
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    console.log(`
Provider Tester

Usage:
  npx tsx src/scripts/test-provider.ts <providerId> [method] [options]
  npx tsx src/scripts/test-provider.ts --all

Arguments:
  providerId    Provider ID to test (e.g., hiAnime, vega, torrentio)
  method        Specific method to test (getPosts, getSearchPosts, getMeta, getEpisodes, getStream, getSettingsSchema)

Options:
  --all, -a     Test all providers (quick getPosts only)
  --verbose, -v Verbose output
  --help, -h    Show this help

Examples:
  npx tsx src/scripts/test-provider.ts hiAnime
  npx tsx src/scripts/test-provider.ts vega getStream
  npx tsx src/scripts/test-provider.ts --all
  npx tsx src/scripts/test-provider.ts hiAnime --verbose
`);
    process.exit(0);
  }
  
  return {
    providerId: args[0],
    method: args[1],
    verbose: args.includes('--verbose') || args.includes('-v'),
  };
}

async function main() {
  const options = parseArgs();
  
  if ('all' in options) {
    await runAllProviders();
  } else {
    await runTests(options as TestOptions);
  }
}

main().catch(console.error);