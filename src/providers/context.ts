import axios from 'axios';
import * as cheerio from 'cheerio';
import { ProviderUnsupportedError } from '@/lib/errors';
import { commonHeaders } from './shared/headers';
import type {
  OpenWebViewOptions,
  OpenWebViewResult,
  ProviderContext,
  ProviderKvStore,
} from './types';

class MemoryKvStore implements ProviderKvStore {
  private readonly values = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined;
  }
  async set(key: string, value: unknown): Promise<void> {
    this.values.set(key, value);
  }
  async delete(key: string): Promise<boolean> {
    return this.values.delete(key);
  }
  async keys(): Promise<string[]> {
    return [...this.values.keys()];
  }
  async clear(): Promise<void> {
    this.values.clear();
  }
}

const stores = new Map<string, ProviderKvStore>();
const contexts = new Map<string, ProviderContext>();

// Axios defaults to the Node http adapter, which does not exist on the Edge
// runtime; there it must use its fetch adapter instead. Node keeps the
// default so existing behaviour (tests, long timeouts) is untouched.
const IS_EDGE = process.env.NEXT_RUNTIME === 'edge';

function storeFor(providerId: string): ProviderKvStore {
  const existing = stores.get(providerId);
  if (existing) return existing;

  const store = new MemoryKvStore();
  stores.set(providerId, store);
  return store;
}

export function openWebView(
  _url: string,
  _options?: OpenWebViewOptions,
): Promise<OpenWebViewResult> {
  return Promise.reject(new ProviderUnsupportedError('Interactive challenge not supported'));
}

export function createProviderContext(providerId: string): ProviderContext {
  const existing = contexts.get(providerId);
  if (existing) return existing;

  const context: ProviderContext = {
    axios: axios.create({ timeout: 30_000, ...(IS_EDGE ? { adapter: 'fetch' } : {}) }),
    cheerio,
    commonHeaders,
    kvStore: storeFor(providerId),
    openWebView,
  };
  contexts.set(providerId, context);
  return context;
}

export { commonHeaders };
