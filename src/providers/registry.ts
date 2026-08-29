// ─── Provider Registry ──────────────────────────────────────────────────────
// The registry wires url.json (config) to provider modules (code).
//
//   urls.json   → source of truth for provider identity, name, url, and ORDER.
//   modules map → the actual ProviderModule implementation per id.
//
// A provider is REGISTERED (live in the app) only when it exists in BOTH:
//   1. urls.json   (add/remove an entry here to enable/disable a provider)
//   2. this file's `modules` map (import + entry)
//
// To add a provider:
//   1. create   src/providers/<id>/index.ts  exporting a ProviderModule
//   2. import + add it to `modules`          (this file)
//   3. add an entry to                       src/providers/urls.json
//
// To remove a provider:
//   delete its urls.json entry (and optionally its import here).
//
// See PROVIDERS.md for the full guide.

import { AppError } from '@/lib/errors';
import { providerManifest } from './_shared';
import type { ProviderModule } from './_shared';
import { anikoto } from './anikoto';
import { movieBoxWeb } from './movieBoxWeb';
import { hiAnime } from './hiAnime';
import { torrentio } from './torrentio';
import { flixhq } from './flixhq';
import { vega } from './vega';

/** Code-behind for each provider id. Order/visibility comes from urls.json. */
const providerModules: Record<string, ProviderModule> = {
  anikoto,
  movieBoxWeb,
  hiAnime,
  torrentio,
  flixhq,
  vega,
};

// Only register providers that exist in both urls.json and the modules map.
// Iterating over urls.json preserves its ordering everywhere in the app.
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