// Upstream fetch with the identity-retry ladder: some provider CDNs reject
// (401/403/406/426) requests carrying a Referer/Origin/User-Agent they don't
// expect, so a rejected first attempt retries once with only the bare
// headers. Deliberately per-request only — no cache of "which variant
// worked for this host" is kept. That cache existed in the previous
// implementation as module-level state, which is exactly the class of
// cross-request bleed this rebuild removes; losing the minor optimization
// it bought is the correct trade.
import { isInternalHost } from '@/lib/net/ssrf';

export class UpstreamError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`Upstream error (${status})`);
    this.status = status;
  }
}

export interface UpstreamHeaders {
  referer?: string;
  origin?: string;
  userAgent?: string;
  cookie?: string;
}

const AUTH_REJECTION_STATUSES = new Set([401, 403, 406, 426]);

function upstreamUserAgent(explicit?: string): string {
  const configured = process.env.STREAM_PROXY_USER_AGENT?.trim();
  return (
    explicit?.trim() ||
    configured ||
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
  );
}

function upstreamReferer(target: URL, explicit?: string): string {
  if (explicit?.trim()) return explicit.trim();
  return `${target.protocol}//${target.host}`;
}

function requestHeaders(
  target: URL,
  headers: UpstreamHeaders | undefined,
  range: string | null,
  variant: 'provider' | 'bare',
): Headers {
  const result = new Headers({
    'User-Agent': upstreamUserAgent(headers?.userAgent),
    Accept: '*/*',
  });
  if (variant === 'provider') {
    result.set('Referer', upstreamReferer(target, headers?.referer));
    result.set('Origin', headers?.origin?.trim() || upstreamReferer(target, headers?.referer));
  }
  const cookie = headers?.cookie?.trim();
  if (cookie) result.set('Cookie', cookie);
  if (range) result.set('Range', range);
  return result;
}

export interface FetchUpstreamOptions {
  headers?: UpstreamHeaders;
  range?: string | null;
  signal?: AbortSignal;
}

/** Fetches an already-resolved, already-authorized upstream URL. Throws
 *  `UpstreamError` for non-2xx responses (after the identity retry) and a
 *  plain `Error` for network-level failures or SSRF rejection. */
export async function fetchUpstream(
  target: URL,
  options: FetchUpstreamOptions = {},
): Promise<Response> {
  if (target.protocol !== 'https:' && target.protocol !== 'http:') {
    throw new Error('Only http(s) targets are allowed');
  }
  if (!process.env.STREAM_PROXY_ALLOW_PRIVATE && isInternalHost(target.hostname)) {
    throw new Error('Target host is not reachable');
  }

  const attempt = async (variant: 'provider' | 'bare'): Promise<Response> => {
    try {
      return await fetch(target, {
        headers: requestHeaders(target, options.headers, options.range ?? null, variant),
        cache: 'no-store',
        redirect: 'follow',
        signal: options.signal,
      });
    } catch (error) {
      throw new Error(
        (error as Error).name === 'AbortError' ? 'Stream request aborted' : 'Upstream unreachable',
      );
    }
  };

  let response = await attempt('provider');
  if (!response.ok && AUTH_REJECTION_STATUSES.has(response.status)) {
    const originalStatus = response.status;
    await response.body?.cancel().catch(() => {});
    response = await attempt('bare');
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new UpstreamError(originalStatus);
    }
  } else if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new UpstreamError(response.status);
  }
  return response;
}
