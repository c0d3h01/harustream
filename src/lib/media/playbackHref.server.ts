// Server-authoritative playback hrefs.
//
// The signed proxy target (and its header set) must be minted where the
// secret lives — the server. The sources API therefore precomputes every
// playback URL (main media + each subtitle track) and ships them to the
// client; the browser only ever consumes opaque hrefs it cannot forge.

import type { StreamSource, Subtitle } from '@/types';
import { headerParams, type PlaybackContext, streamPlaybackUrl } from './playbackHref';
import { signProxyTarget } from './proxyToken';

const PROXY_HEADER_NAMES = ['referer', 'origin', 'userAgent', 'cookie'] as const;

/** Stamp exp+sig onto a passthrough query when tokens are enabled. */
function signPassthroughParams(params: URLSearchParams): URLSearchParams {
  const url = params.get('url');
  const headers: Parameters<typeof signProxyTarget>[1] = {};
  if (url) {
    for (const name of PROXY_HEADER_NAMES) {
      const value = params.get(name);
      if (value) headers[name] = value;
    }
  }
  const signed = signProxyTarget(url ?? '', headers);
  if (signed && url) {
    params.set('exp', String(signed.exp));
    params.set('sig', signed.sig);
  }
  return params;
}

// Main media src, authoritative variant. All formats stream through
// resolve-and-stream mode, which keeps provider-signed URLs off the client
// and resolves IP-bound crypto per request server-side.
export function mediaPlaybackHref(source: StreamSource, context: PlaybackContext): string {
  return streamPlaybackUrl(source, context);
}

export function subtitlePlaybackHref(subtitle: Subtitle, headers?: Record<string, string>): string {
  const params = new URLSearchParams({ url: subtitle.url });
  for (const [name, value] of headerParams(headers)) params.set(name, value);
  if (subtitle.format && subtitle.format !== 'vtt') {
    params.set('subtitleFormat', subtitle.format);
  }
  return `/api/proxy?${signPassthroughParams(params).toString()}`;
}
