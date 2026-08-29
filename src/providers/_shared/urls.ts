// ─── Provider URL Config ────────────────────────────────────────────────────
// Typed provider endpoints are the single source of truth.
// No remote fetching — everything is local.

import { providerUrls } from '../urls';
import type { ProviderUrls } from './types';


function entry(providerId: string): { name?: string; url?: string } {
  const e = (providerUrls as ProviderUrls)[providerId];
  if (!e) throw new Error(`urls.ts: no entry for provider "${providerId}"`);
  return e;
}

/** Base URL for an upstream provider, from urls.ts. */
export function providerBaseUrl(providerId: string): string {
  const url = entry(providerId).url;
  if (!url) throw new Error(`urls.ts: no url configured for provider "${providerId}"`);
  return url;
}

/** Display name for a provider, from urls.ts. */
export function providerName(providerId: string): string {
  const name = entry(providerId).name;
  if (!name) throw new Error(`urls.ts: no name configured for provider "${providerId}"`);
  return name;
}

/** The full manifest — id -> { name, url }. */
export const providerManifest = providerUrls;
