// Build the browser-facing playback URL for a provider source. Every source
// (HLS manifests and natively playable MP4s alike) goes through /api/proxy so
// the server injects the headers provider hosts require and rewrites HLS
// manifests — the browser alone cannot reach most provider origins due to
// CORS + referer restrictions. Provider streams advertise the headers their
// host enforces ({ Referer, Origin, User-Agent, Cookie, ... }); those are
// forwarded as query params and /api/proxy injects them upstream. MKV
// sources play natively in Chromium (built-in FFmpeg demuxers) and otherwise
// fall through to the next source.

const PROXY_HEADER_PARAMS = ['referer', 'origin', 'userAgent', 'cookie'] as const;

export function playbackUrl(url: string, headers?: Record<string, string> | null): string {
  if (!url) return '';
  const params = new URLSearchParams({ url });
  if (headers) {
    for (const param of PROXY_HEADER_PARAMS) {
      const value = headerValue(headers, param);
      if (value) params.set(param, value);
    }
  }
  return `/api/proxy?${params.toString()}`;
}

// Provider modules are inconsistent about header casing (Referer vs referer),
// so lookups are case-insensitive.
function headerValue(headers: Record<string, string>, name: string): string | undefined {
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return entry?.[1];
}
