import urls from './urls.json';

type ProviderUrlEntry = { name?: string; url?: string };
type ProviderUrls = Record<string, ProviderUrlEntry>;

const providerUrls = urls as ProviderUrls;

function entry(providerId: string): ProviderUrlEntry {
  const e = providerUrls[providerId];
  if (!e) throw new Error(`urls.json: no entry for provider "${providerId}"`);
  return e;
}

/** Base URL for an upstream provider, from src/providers/urls.json. */
export function providerBaseUrl(providerId: string): string {
  const url = entry(providerId).url;
  if (!url) throw new Error(`urls.json: no url configured for provider "${providerId}"`);
  return url;
}

/** Display name for a provider, from src/providers/urls.json. */
export function providerName(providerId: string): string {
  const name = entry(providerId).name;
  if (!name) throw new Error(`urls.json: no name configured for provider "${providerId}"`);
  return name;
}

/** The full manifest — id -> { name, url }. */
export const providerManifest = providerUrls;
