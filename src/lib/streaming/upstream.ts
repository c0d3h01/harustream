import { assertPublicUrl } from '@/lib/net/ssrf';
import { USER_AGENT } from '@/providers/_shared/headers';
import { providerAllowsHost } from '@/providers/_shared/urls';

const MAX_REDIRECTS = 5;

// Hop-by-hop headers must not be copied from a provider payload; the runtime
// manages them. Everything else is forwarded because providers legitimately
// need their own identity headers (Referer, x-client-info, cf_clearance, ...).
const BLOCKED_HEADERS = new Set([
  'connection',
  'content-length',
  'host',
  'keep-alive',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'accept-encoding',
]);

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

// Provider CDNs throttle per burst; one short retry turns most of these into a
// success. Anything the CDN answers with is transient enough to be worth one
// more attempt — a second failure surfaces as 502.
const RETRY_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524]);
const RETRY_DELAY_MS = 250;

export interface UpstreamOptions {
  providerId: string;
  headers?: Record<string, string>;
  range?: string | null;
  signal?: AbortSignal;
}

export interface UpstreamResult {
  response: Response;
  /** Final URL after redirects — manifests must resolve children against it. */
  url: URL;
}

function buildHeaders(headers: Headers): Headers {
  const out = new Headers();
  for (const [name, value] of headers) {
    if (BLOCKED_HEADERS.has(name.toLowerCase())) continue;
    if (typeof value === 'string' && value.trim()) out.set(name, value.trim());
  }
  return out;
}

/**
 * Fetches an upstream URL for a provider. Provider headers are applied
 * case-insensitively (providers emit `Referer`, not `referer`), redirects are
 * followed manually so every hop is re-validated, and credentials never survive
 * a cross-origin redirect.
 */
export async function fetchUpstream(
  startUrl: URL,
  options: UpstreamOptions,
): Promise<UpstreamResult> {
  let url = startUrl;
  // Case matters here: `new Headers({'User-Agent': a, 'user-agent': b})` keeps
  // both keys and then *appends* them, which would hand the upstream two
  // user-agents. Lowercase the provider's headers first, then default.
  const identity = Object.fromEntries(
    Object.entries(options.headers ?? {}).map(([name, value]) => [name.toLowerCase(), value]),
  );
  let headers = buildHeaders(new Headers({ accept: '*/*', ...identity }));
  if (!headers.has('user-agent')) headers.set('user-agent', USER_AGENT);
  if (options.range) headers.set('Range', options.range);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    assertPublicUrl(url);
    if (!providerAllowsHost(options.providerId, url.hostname)) {
      throw Object.assign(new Error('Upstream host is not allowed for this provider'), {
        status: 403,
      });
    }
    const init: RequestInit = {
      headers,
      cache: 'no-store',
      redirect: 'manual',
      signal: options.signal,
    };
    let response = await fetch(url, init);
    // Provider CDNs throttle per burst; one short retry turns most of these
    // into a success. Anything the CDN answers with is transient enough to be
    // worth one more attempt — a second failure surfaces as 502.
    if (RETRY_STATUSES.has(response.status)) {
      await response.body?.cancel();
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      response = await fetch(url, init);
    }

    const location = response.headers.get('location');
    if (!REDIRECT_STATUSES.has(response.status) || !location) {
      if (!response.ok) {
        // Never relay the upstream's status. A CDN answering 427/429/530 makes
        // Cloudflare render its own branded error page and tells the player
        // nothing actionable; the real status belongs in our log, not the
        // response. Only our own policy denials keep their own code.
        throw Object.assign(new Error(`Upstream request failed (${response.status})`), {
          status: 502,
          upstreamStatus: response.status,
        });
      }
      return { response, url };
    }

    const next = new URL(location, url);
    if (next.origin !== url.origin) {
      // Cloudflare forwards every header across a followed redirect, so drop
      // credentials ourselves before the next hop sees them.
      headers = buildHeaders(headers);
      headers.delete('Cookie');
      headers.delete('Authorization');
    }
    url = next;
  }

  throw Object.assign(new Error('Too many upstream redirects'), { status: 502 });
}
