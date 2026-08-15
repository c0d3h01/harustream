// Server-only provider configuration. Never import from a "use client" module.

import { DEFAULT_PROVIDER_ID } from './providers';

// Primary upstream provider API. The app proxies every catalog/meta/episode/
// stream request through this base. Optional comma-separated fallbacks let the
// proxy fail over to another deployment when the primary is unreachable.
function parseBases(): string[] {
  const primary = process.env.NEXT_PUBLIC_PROVIDER_API_URL?.replace(/\/+$/, '');
  const fallbacks = (process.env.PROVIDER_API_FALLBACK_URLS ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  return [...(primary ? [primary] : []), ...fallbacks];
}

export const PROVIDER_BASES: string[] = parseBases();

export const PROVIDER_BASE: string = PROVIDER_BASES[0] ?? '';

export const DEFAULT_PROVIDER = DEFAULT_PROVIDER_ID;

// How long a provider request may take before we abort it (ms).
export const PROVIDER_TIMEOUT_MS = Number(process.env.PROVIDER_TIMEOUT_MS ?? 15000);

// How many attempts we make against the provider (including the first).
export const PROVIDER_MAX_ATTEMPTS = Number(process.env.PROVIDER_MAX_ATTEMPTS ?? 2);
