// Build the browser-facing playback URL for a provider source. Every source
// (HLS manifests and natively playable MP4s alike) goes through /api/proxy so
// the server injects the headers provider hosts require and rewrites HLS
// manifests — the browser alone cannot reach most provider origins due to
// CORS + referer restrictions. Provider streams advertise the headers their
// host enforces ({ Referer, Origin, User-Agent, Cookie, ... }); those are
// forwarded as query params and /api/proxy injects them upstream. MKV
// sources play natively in Chromium (built-in FFmpeg demuxers) and otherwise
// fall through to the next source.

export { playbackUrl } from '@/playback/proxy';
