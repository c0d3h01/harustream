// ─── Provider URL Config ────────────────────────────────────────────────────
// Reads provider names and base URLs from urls.json (the single source of truth).
// No remote fetching — everything is local.

import type { ProviderUrls } from './types';
import urls from '../urls.json';

const providerUrls = urls as ProviderUrls;

function entry(providerId: string): { name?: string; url?: string } {
  const e = providerUrls[providerId];
  if (!e) throw new Error(`urls.json: no entry for provider "${providerId}"`);
  return e;
}

/** Base URL for an upstream provider, from urls.json. */
export function providerBaseUrl(providerId: string): string {
  const url = entry(providerId).url;
  if (!url) throw new Error(`urls.json: no url configured for provider "${providerId}"`);
  return url;
}

/** Display name for a provider, from urls.json. */
export function providerName(providerId: string): string {
  const name = entry(providerId).name;
  if (!name) throw new Error(`urls.json: no name configured for provider "${providerId}"`);
  return name;
}

/** The full manifest — id -> { name, url }. */
export const providerManifest = providerUrls;
