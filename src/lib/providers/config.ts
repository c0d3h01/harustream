// Server-side provider runtime configuration. The single source of truth is
// the manifest (urls.json) URL from env; the sibling manifest.json and the
// dist/ module directory are derived from its location.

const RAW_MANIFEST_URL = process.env.PROVIDER_MANIFEST_URL?.trim() ?? '';

// The module base and manifest.json are co-located with urls.json in the same
// repo. Deriving them keeps a fork of the providers repo working without
// touching this file.
export const PROVIDER_MANIFEST_URL = RAW_MANIFEST_URL;
export const PROVIDER_SOURCE_BASE = (() => {
  if (!RAW_MANIFEST_URL) return '';
  const url = new URL(RAW_MANIFEST_URL);
  const dir = url.pathname.slice(0, url.pathname.lastIndexOf('/'));
  return `${url.origin}${dir}`;
})();
export const PROVIDER_MANIFEST_JSON_URL = PROVIDER_SOURCE_BASE
  ? `${PROVIDER_SOURCE_BASE}/manifest.json`
  : '';
export const PROVIDER_MODULE_BASE = PROVIDER_SOURCE_BASE ? `${PROVIDER_SOURCE_BASE}/dist/` : '';

export function isProviderRuntimeConfigured(): boolean {
  return PROVIDER_MANIFEST_URL.length > 0 && PROVIDER_SOURCE_BASE.length > 0;
}

// Per-module-call execution timeout; slow provider sites (WordPress blogs,
// cloudflare-fronted pages) routinely take seconds.
export const PROVIDER_TIMEOUT_MS = numberEnv('PROVIDER_TIMEOUT_MS', 20_000);
// Retries when fetching the manifest and module sources themselves.
export const PROVIDER_MAX_ATTEMPTS = numberEnv('PROVIDER_MAX_ATTEMPTS', 2);
// Max concurrent provider executions for fan-out endpoints.
export const PROVIDER_CONCURRENCY = numberEnv('PROVIDER_CONCURRENCY', 6);
// Overall deadline for a fan-out (search-all / featured-all) response.
export const PROVIDER_DEADLINE_MS = numberEnv('PROVIDER_DEADLINE_MS', 12_000);
// Sync execution budget for a module's top-level code (it only wires up
// exports; the async work happens inside the invoked function).
export const MODULE_SYNC_TIMEOUT_MS = numberEnv('PROVIDER_SYNC_TIMEOUT_MS', 5_000);

// How long fetched artifacts are cached in-process. The provider sites are
// served through a CDN, so a stale module for a few hours is acceptable and
// keeps fan-out endpoints fast.
export const MANIFEST_CACHE_TTL_MS = hour(1);
export const MODULE_CACHE_TTL_MS = hour(6);

function hour(h: number): number {
  return h * 60 * 60 * 1000;
}

function numberEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
