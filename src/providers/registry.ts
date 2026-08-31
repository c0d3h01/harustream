// ─── Provider Registry ──────────────────────────────────────────────────────
// The registry wires urls.ts (config) to provider modules (code).
//
//   urls.ts     → source of truth for provider identity, name, url, and ORDER.
//   modules map → the actual ProviderModule implementation per id.
//
// A provider is REGISTERED (live in the app) only when it exists in BOTH:
//   1. urls.ts   (add/remove an entry here to enable/disable a provider)
//   2. this file's `modules` map (import + entry)
//
// To add a provider:
//   1. create   src/providers/<id>/index.ts  exporting a ProviderModule
//   2. import + add it to `modules`          (this file)
//   3. add an entry to                       src/providers/urls.ts
//
// To remove a provider:
//   delete its urls.ts entry (and optionally its import here).
//
// See PROVIDERS.md for the full guide.

import { AppError } from '@/lib/errors';
import type { ProviderModule } from './_shared';
import { providerManifest } from './_shared';
import { anikoto } from './anikoto';
import { movieBoxWeb } from './movieBoxWeb';
import { torrentio } from './torrentio';
import { vega } from './vega';

/** Code-behind for each provider id. Order/visibility comes from urls.ts. */
const providerModules: Record<string, ProviderModule> = {
  anikoto,
  movieBoxWeb,
  torrentio,
  vega,
};

// Only register providers that exist in both urls.ts and the modules map.
// Iterating over urls.ts preserves its ordering everywhere in the app.
export const providerRegistry: Record<string, ProviderModule> = {};
for (const id of Object.keys(providerManifest)) {
  const module = providerModules[id];
  if (module && !(id in providerRegistry)) {
    providerRegistry[id] = module;
  }
}

export function getProvider(id: string): ProviderModule {
  const provider = providerRegistry[id];
  if (!provider) throw new AppError('NOT_FOUND', `Unknown provider: ${id}`);
  return provider;
}

export function listProviders(): ProviderModule[] {
  return Object.values(providerRegistry);
}

export { providerManifest } from './_shared';
