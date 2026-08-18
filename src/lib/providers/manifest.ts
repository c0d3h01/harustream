// Live provider registry, built from urls.json (the channel list) merged
// with manifest.json (module dirs, types, versions) from the same repo.
// Nothing is hardcoded — the manifest is fetched at runtime and cached for
// an hour. Providers without a dist/ module cannot execute, so they are
// exposed for listing but excluded from the executable set.

import { cachedFetch } from './cache';
import { MANIFEST_CACHE_TTL_MS, PROVIDER_MANIFEST_JSON_URL, PROVIDER_MANIFEST_URL } from './config';
import { providerFetchJson } from './fetch';

export type ProviderInfo = {
  /** urls.json key — the stable app-facing id. */
  id: string;
  /** Human-readable channel name (urls.json `name`). */
  name: string;
  /** Channel home URL. */
  url: string;
  /** Provider category from manifest.json (movies, anime, …). */
  type: string;
  /** Module version from manifest.json. */
  version?: string;
  /** dist/ directory hosting the modules, when one exists. */
  moduleDir?: string;
  /** Whether the manifest marks the module as disabled. */
  disabled: boolean;
};

type ManifestEntry = {
  value?: string;
  display_name?: string;
  type?: string;
  version?: string;
  disabled?: boolean;
};

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function findManifestEntry(
  key: string,
  name: string,
  manifest: ManifestEntry[],
): ManifestEntry | undefined {
  const keyNorm = normalize(key);
  const nameNorm = normalize(name);
  return manifest.find(
    (entry) =>
      normalize(entry.display_name ?? '') === nameNorm ||
      normalize(entry.value ?? '') === keyNorm ||
      normalize(entry.display_name ?? '') === keyNorm,
  );
}

export async function getProviders(): Promise<ProviderInfo[]> {
  return cachedFetch('providers:manifest', MANIFEST_CACHE_TTL_MS, async () => {
    const urls = (await providerFetchJson<Record<string, { name?: string; url?: string }>>(
      PROVIDER_MANIFEST_URL,
    )) as Record<string, { name?: string; url?: string }>;
    const manifest = (await providerFetchJson<ManifestEntry[]>(PROVIDER_MANIFEST_JSON_URL).catch(
      () => [],
    )) as ManifestEntry[];

    return Object.entries(urls)
      .map(([id, entry]) => {
        const matched = findManifestEntry(id, entry.name ?? id, manifest);
        return {
          id,
          name: entry.name ?? id,
          url: entry.url ?? '',
          type: matched?.type ?? '',
          version: matched?.version,
          moduleDir: matched?.value,
          disabled: matched?.disabled ?? false,
        } satisfies ProviderInfo;
      })
      .filter((provider) => provider.url.length > 0);
  });
}

/** Providers that have a dist/ module and can actually execute. */
export async function getExecutableProviders(): Promise<ProviderInfo[]> {
  const providers = await getProviders();
  return providers.filter((provider) => provider.moduleDir && !provider.disabled);
}

export async function providerById(id: string): Promise<ProviderInfo | undefined> {
  const providers = await getProviders();
  const needle = id.toLowerCase();
  return providers.find((provider) => provider.id.toLowerCase() === needle);
}

export async function executableProviderById(id: string): Promise<ProviderInfo | undefined> {
  const providers = await getExecutableProviders();
  const needle = id.toLowerCase();
  return providers.find((provider) => provider.id.toLowerCase() === needle);
}
