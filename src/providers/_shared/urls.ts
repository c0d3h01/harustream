import { providerUrls } from '../urls';

/** Fail-loud name lookup: throws on registry mismatches instead of echoing the id. */
export function providerName(providerId: string): string {
  if (!Object.hasOwn(providerUrls, providerId)) throw new Error(`Unknown provider: ${providerId}`);
  return providerUrls[providerId].name;
}

export function providerBaseUrl(providerId: string): string {
  if (!Object.hasOwn(providerUrls, providerId)) throw new Error(`Unknown provider: ${providerId}`);
  return providerUrls[providerId].url;
}

function patternMatches(pattern: string, host: string): boolean {
  if (pattern === '*') return true;
  if (!pattern.includes('*')) return pattern === host;
  const source = pattern
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${source}$`).test(host);
}

/** True when `hostname` is the provider's own site or a declared upstream host. */
export function providerAllowsHost(providerId: string, hostname: string): boolean {
  const entry = providerUrls[providerId];
  if (!entry) return false;
  const host = hostname.toLowerCase();
  const site = new URL(entry.url).hostname.toLowerCase();
  if (host === site || host.endsWith(`.${site}`)) return true;
  return (entry.upstreamHosts ?? []).some((pattern) => patternMatches(pattern.toLowerCase(), host));
}
