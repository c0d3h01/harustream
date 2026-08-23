// Proxy-aware outbound HTTP for the server-side runtime.
//
// Vercel's datacenter IPs are rejected by some provider CDNs (403 for the hub
// pages the provider modules scrape and for the media CDNs the media proxy
// reads). The app can route ALL of its server-side egress through a single
// forward proxy running on a residential/non-blocked IP by setting the
// standard HTTP_PROXY/HTTPS_PROXY env vars — this module turns those into an
// undici ProxyAgent (for the provider sandbox and media proxy fetches) and an
// axios proxy config (for the provider modules' axios instance).
//
// When no proxy is configured everything passes through untouched, so local
// dev and proxies-less deployments behave exactly as before.

import { ProxyAgent, fetch as undiciFetch } from 'undici';

export type ProxyCredentials = { username: string; password: string };

export type ProxyTarget = {
  url: string;
  credentials?: ProxyCredentials;
};

// NO_PROXY host suffixes bypass the proxy (loopback, provider hosts that are
// already reachable, etc.). Standard comma-separated list of domains, with
// optional leading dot and optional :port.
function noProxyEntries(): string[] {
  const raw = (process.env.NO_PROXY ?? process.env.no_proxy ?? '').trim();
  return raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase().replace(/^\./, ''))
    .filter(Boolean);
}

function shouldBypass(target: URL): boolean {
  const bypass = noProxyEntries();
  if (bypass.length === 0) return false;
  const host = target.hostname.toLowerCase();
  const authority = target.host.toLowerCase();
  return bypass.some((entry) => {
    if (entry === '*') return true;
    if (entry.includes(':')) return authority === entry;
    return host === entry || host.endsWith(`.${entry}`);
  });
}

// Reads HTTP_PROXY / HTTPS_PROXY / ALL_PROXY (upper or lower case), matching
// curl's behavior. Returns null when unset or the target is on NO_PROXY.
export function resolveProxy(targetUrl?: string): ProxyTarget | null {
  let requestTarget: URL | undefined;
  if (targetUrl) {
    try {
      requestTarget = new URL(targetUrl);
      if (shouldBypass(requestTarget)) return null;
    } catch {
      // Unparsable target URL — let the caller surface the real error.
    }
  }

  const httpsProxy = process.env.HTTPS_PROXY ?? process.env.https_proxy;
  const httpProxy = process.env.HTTP_PROXY ?? process.env.http_proxy;
  const allProxy = process.env.ALL_PROXY ?? process.env.all_proxy;
  const raw =
    requestTarget?.protocol === 'http:'
      ? (httpProxy ?? allProxy ?? '')
      : (httpsProxy ?? httpProxy ?? allProxy ?? '');
  const url = raw.trim();
  if (!url) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const target: ProxyTarget = { url: parsed.href.replace(/\/$/, '') };
  if (parsed.username || parsed.password) {
    target.credentials = {
      username: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
    };
  }
  return target;
}

// fetch() that routes through the configured forward proxy when present. The
// global fetch() is swapped for undici's so a per-request dispatcher (the
// ProxyAgent) can be attached; the response contract is identical. Accepts the
// same input forms as the standard fetch (URL, string, or Request).
export function proxyFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const target = resolveProxy(url);
  if (!target) return fetch(input, init);
  const agent = proxyAgentFor(target);
  if (!agent) return fetch(input, init);
  return undiciFetch(
    input as Parameters<typeof undiciFetch>[0],
    {
      ...init,
      dispatcher: agent,
    } as Parameters<typeof undiciFetch>[1],
  ) as unknown as Promise<Response>;
}

// Lazily build (and reuse) a ProxyAgent for each resolved proxy target.
const cachedAgents = new Map<string, ProxyAgent>();

function proxyAgentFor(target: ProxyTarget): ProxyAgent | null {
  const cached = cachedAgents.get(target.url);
  if (cached) return cached;
  const agent = new ProxyAgent({ uri: target.url, keepAliveTimeout: 30_000 });
  cachedAgents.set(target.url, agent);
  return agent;
}

// axios proxy config from the same env vars, for the provider modules' axios
// instance (they don't go through the ProxyAgent above).
export function axiosProxyConfig(
  targetUrl?: string,
): { protocol: string; host: string; port: number; auth?: ProxyCredentials } | undefined {
  const target = resolveProxy(targetUrl);
  if (!target) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(target.url);
  } catch {
    return undefined;
  }
  const config: { protocol: string; host: string; port: number; auth?: ProxyCredentials } = {
    protocol: parsed.protocol.replace(/:$/, ''),
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : parsed.protocol === 'https:' ? 443 : 80,
  };
  if (target.credentials) config.auth = target.credentials;
  return config;
}
