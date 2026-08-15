// Decide how a given source URL must be played. The provider returns mostly
// MKV files (h264/AAC inside a Matroska container) which browsers cannot
// decode natively. We detect those and route them through /api/play which
// remuxes/transcodes to a fragmented MP4 for MediaSource.
//
// Browser-playable sources (HLS and native MP4) are routed through
// /api/proxy so the server injects the Referer/User-Agent headers provider
// hosts require and rewrites HLS manifests — the browser alone cannot reach
// most provider origins due to CORS + referer restrictions.

export type PlaybackKind = 'hls' | 'native' | 'transcode';

export function classifySource(url: string, type?: string): PlaybackKind {
  if (!url) return 'transcode';

  // Explicit hint from the provider (e.g. "mkv").
  const t = type?.toLowerCase();
  if (t === 'mkv' || t === 'matroska' || t === 'avi' || t === 'ts') {
    return 'transcode';
  }
  if (t === 'mp4' || t === 'webm' || t === 'ogg' || t === 'ogv' || t === 'mov') {
    return 'native';
  }

  const path = url.split('?')[0].toLowerCase();
  if (path.endsWith('.m3u8')) return 'hls';
  if (path.endsWith('.mp4') || path.endsWith('.webm')) return 'native';
  if (path.endsWith('.ogg') || path.endsWith('.ogv') || path.endsWith('.mov')) {
    return 'native';
  }
  // Anything without a recognizable video extension (signed R2 URLs, hub
  // pages, unknown containers) goes through the transcode proxy.
  return 'transcode';
}

// Build the browser-facing playback URL for a provider source.
//  - HLS / native → /api/proxy (server-side fetch + manifest rewrite)
//  - transcode     → /api/play (ffmpeg remux/transcode + MSE)
export function playbackUrl(url: string, kind: PlaybackKind, start = 0): string {
  if (!url) return '';
  if (kind === 'transcode') {
    return `/api/play?url=${encodeURIComponent(url)}${start > 0 ? `&start=${start}` : ''}`;
  }
  return `/api/proxy?url=${encodeURIComponent(url)}`;
}
