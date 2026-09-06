// Domain types for the streaming pipeline. A stream is identified by an
// explicit, stable triple — never by a cache lookup — so the proxy route can
// be a pure function of what a request carries instead of what some cache
// happens to hold at the moment the request lands.

import type { SkipInterval, StreamFormat } from '@/types/media';

export type { SkipInterval, StreamFormat };
export type SubtitleFormat = 'vtt' | 'srt' | 'ttml';

export interface SubtitleTrack {
  id: string;
  label: string;
  language: string;
  url: string;
  format: SubtitleFormat;
  /** Server-minted proxy href — set once `mintPlaybackHrefs` has run. */
  href?: string;
}

/**
 * A single playable option. The unique key for a piece of content is the
 * triple `(mediaId, providerId, variantId)`:
 *  - `mediaId` — stable id of the episode/movie unit being played (reuses
 *    the existing `idFor(providerId, ref)` convention; provider-scoped,
 *    same as `Media.id`/`Episode.id` already are).
 *  - `providerId` — which provider resolved it.
 *  - `variantId` — quality + format + server label, disambiguating multiple
 *    options the same provider returned for the same `mediaId`.
 */
export interface StreamVariant {
  mediaId: string;
  providerId: string;
  variantId: string;
  format: StreamFormat;
  quality?: string;
  /** Provider's own server/quality label, shown in the source selector. */
  label: string;
  headers?: Record<string, string>;
  subtitles: SubtitleTrack[];
  skip?: SkipInterval[];
  /** Server-minted proxy href — set once `mintPlaybackHrefs` has run. */
  playbackHref?: string;
}

/** The resolved upstream target a token seals. Never exposed to the client. */
export interface ResolvedTarget {
  url: string;
  headers?: Record<string, string>;
  exp: number;
  /** Set only for subtitle tokens that need conversion to VTT at the proxy. */
  subtitleFormat?: 'srt' | 'ttml';
}

/** Path segment kinds the proxy route serves. */
export type ProxyResourceKind = 'manifest' | 'binary' | 'subtitle';
