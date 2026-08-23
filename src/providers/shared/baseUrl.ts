import type { ProviderKvStore } from '@/providers/types';

const defaultEndpoint =
  'https://raw.githubusercontent.com/Zenda-Cross/vega-providers/refs/heads/main/urls.json';
const ttlMs = 60 * 60 * 1000;
const fallback: Record<string, string> = {
  Moviesmod: 'https://moviesmod.zone',
  movieBoxWeb: 'https://themoviebox.org',
  anikoto: 'https://anikototv.to',
};

let cached: Record<string, string> | undefined;
let expiresAt = 0;
let pending: Promise<Record<string, string>> | undefined;

async function fetchUrls(): Promise<Record<string, string>> {
  if (cached && expiresAt > Date.now()) return cached;
  if (pending) return pending;
  const endpoint = process.env.PROVIDER_MANIFEST_URL?.trim() || defaultEndpoint;
  pending = fetch(endpoint)
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`URL configuration request failed: ${response.status}`);
      }
      const data: unknown = await response.json();
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid URL configuration');
      }
      const urls: Record<string, string> = { ...fallback };
      for (const [id, value] of Object.entries(data)) {
        if (value && typeof value === 'object' && 'url' in value && typeof value.url === 'string') {
          urls[id] = value.url;
        }
      }
      cached = urls;
      expiresAt = Date.now() + ttlMs;
      return urls;
    })
    .catch(() => cached ?? { ...fallback })
    .finally(() => {
      pending = undefined;
    });
  return pending;
}

function envKeys(id: string): string[] {
  const normalized = id.replace(/[^A-Za-z0-9]/g, '_');
  return [`PROVIDER_BASE_URL_${normalized}`, `PROVIDER_BASE_URL_${normalized.toUpperCase()}`];
}

export async function getBaseUrl(id: string, _kvStore?: ProviderKvStore): Promise<string> {
  const override = envKeys(id)
    .map((key) => process.env[key])
    .find((value) => value?.trim());
  if (override?.trim()) return override.trim().replace(/\/+$/, '');
  const urls = await fetchUrls();
  return (urls[id] ?? fallback[id] ?? '').replace(/\/+$/, '');
}
