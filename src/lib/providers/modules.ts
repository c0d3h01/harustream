// Loads a provider's dist/ module source (CJS bundle) with a long TTL cache.
// The module base is derived from the manifest URL's repo, so forks work out
// of the box.

import { ProviderError } from '@/lib/api/errors';
import { cachedFetch } from './cache';
import { MODULE_CACHE_TTL_MS, PROVIDER_MODULE_BASE } from './config';
import { providerFetch } from './fetch';
import type { ProviderInfo } from './manifest';

export type ModuleKind = 'posts' | 'meta' | 'stream' | 'episodes' | 'catalog';

export async function loadModuleSource(provider: ProviderInfo, kind: ModuleKind): Promise<string> {
  const dir = provider.moduleDir;
  if (!dir) {
    throw new ProviderError(
      404,
      `Provider ${provider.id} has no ${kind} module`,
      undefined,
      'INVALID_SHAPE',
    );
  }
  const url = `${PROVIDER_MODULE_BASE}${encodeURIComponent(dir)}/${kind}.js`;
  return cachedFetch(`module:${url}`, MODULE_CACHE_TTL_MS, async () => {
    const response = await providerFetch(url, { timeoutMs: 20_000 });
    const code = await response.text();
    // The bundles are esbuild CJS (`exports.x = …`). Anything else would not
    // execute in the vm sandbox — fail fast with a clear message.
    if (!/\bexports\.|module\.exports/.test(code)) {
      throw new ProviderError(
        502,
        `Provider module ${provider.id}/${kind} is not a CommonJS bundle`,
        url,
        'INVALID_SHAPE',
      );
    }
    return code;
  });
}
