// Pure manifest-rewriting functions: given raw upstream manifest text, they
// return text with every nested reference pointed back at our proxy. No I/O
// here — the proxy route fetches the manifest, calls these, and streams the
// result. Kept pure and dependency-free so they're trivially unit-testable
// with synthetic manifest text.

import { canonicalPath, chunkIdFor, proxyPath } from './cacheKeys';
import { mintProxyToken } from './token';
import type { ProxyResourceKind, StreamVariant } from './types';

export interface ManifestRewriteContext {
  variant: Pick<StreamVariant, 'mediaId' | 'providerId' | 'variantId'>;
  headers?: Record<string, string>;
  /** How long minted segment/sub-manifest tokens stay valid. */
  ttlMs: number;
}

function isManifestUrl(url: string): boolean {
  const path = url.split('?', 1)[0].toLowerCase();
  return path.endsWith('.m3u8') || path.endsWith('.mpd');
}

/** Classifies a fetched response as an HLS or DASH manifest so the proxy
 *  route knows which rewriter to run. Null means "not a manifest" (a
 *  progressive file, segment, or subtitle). */
export function manifestKind(contentType: string | null, url: string): 'hls' | 'dash' | null {
  const path = url.split('?', 1)[0].toLowerCase();
  const type = contentType ?? '';
  if (path.endsWith('.m3u8') || type.includes('mpegurl') || type.includes('apple.mpegurl')) {
    return 'hls';
  }
  if (path.endsWith('.mpd') || type.includes('dash+xml')) return 'dash';
  return null;
}

async function mintHref(
  absoluteUrl: string,
  kind: ProxyResourceKind,
  ctx: ManifestRewriteContext,
): Promise<string> {
  const chunkId = await chunkIdFor(absoluteUrl);
  const path = canonicalPath(
    ctx.variant.mediaId,
    ctx.variant.providerId,
    ctx.variant.variantId,
    kind,
    chunkId,
  );
  const { token, exp } = await mintProxyToken(
    { url: absoluteUrl, headers: ctx.headers },
    ctx.ttlMs,
    path,
  );
  return `${proxyPath(ctx.variant, kind, chunkId)}?exp=${exp}&token=${encodeURIComponent(token)}`;
}

/** Resolves every raw URI once (deduped) into its proxied href. Unresolvable
 *  or malformed references pass through unchanged rather than breaking the
 *  whole manifest. */
async function resolveHrefs(
  rawUris: Iterable<string>,
  manifestUrl: string,
  ctx: ManifestRewriteContext,
): Promise<Map<string, string>> {
  const entries = await Promise.all(
    Array.from(new Set(rawUris)).map(async (raw) => {
      let absolute: string;
      try {
        absolute = new URL(raw, manifestUrl).toString();
      } catch {
        return [raw, raw] as const;
      }
      const kind: ProxyResourceKind = isManifestUrl(absolute) ? 'manifest' : 'binary';
      return [raw, await mintHref(absolute, kind, ctx)] as const;
    }),
  );
  return new Map(entries);
}

const URI_ATTR_RE = /URI="([^"]+)"/gi;

/** Rewrites an HLS (.m3u8) playlist: every `URI="..."` attribute (keys, init
 *  maps, alt audio/subtitle playlists, i-frame playlists) and every bare
 *  segment/sub-playlist line. Comments and attributes without `URI=` pass
 *  through untouched. */
export async function rewriteHlsManifest(
  manifest: string,
  manifestUrl: string,
  ctx: ManifestRewriteContext,
): Promise<string> {
  const lines = manifest.split(/\r?\n/);
  const rawUris = new Set<string>();
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) {
      if (line.includes('URI="')) {
        for (const match of line.matchAll(URI_ATTR_RE)) rawUris.add(match[1]);
      }
    } else if (trimmed) {
      rawUris.add(trimmed);
    }
  }
  const hrefByRaw = await resolveHrefs(rawUris, manifestUrl, ctx);
  return lines
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('#')) {
        if (!line.includes('URI="')) return line;
        return line.replace(
          URI_ATTR_RE,
          (_match, raw: string) => `URI="${hrefByRaw.get(raw) ?? raw}"`,
        );
      }
      if (trimmed) return hrefByRaw.get(trimmed) ?? line;
      return line;
    })
    .join('\n');
}

const DASH_ATTR_RE = /\b(sourceURL|media|initialization)="([^"]+)"/gi;
const BASE_URL_RE = /<BaseURL>([^<]+)<\/BaseURL>/gi;
// A DASH SegmentTemplate's `media`/`initialization` attributes are URL
// *templates* ($Number$, $Time$, $RepresentationID$, …) that the client
// expands per segment — they are not literal URLs and must never be
// individually rewritten. Their presence means the whole representation's
// segments come from one BaseURL, handled by `rewriteDashBaseUrlAsPrefix`
// instead of per-literal rewriting.
const SEGMENT_TEMPLATE_RE = /\$(Number|Time|RepresentationID|Bandwidth)\$/;

/** Rewrites the literal-URL forms of a DASH manifest: `<BaseURL>` element
 *  content and `sourceURL="..."`/`media="..."`/`initialization="..."`
 *  attributes that are plain URLs (SegmentList-style manifests). Templated
 *  `SegmentTemplate` manifests are detected and handled by rewriting their
 *  `<BaseURL>` into a proxy prefix instead — see
 *  `rewriteDashBaseUrlAsPrefix` — since a URL template can't be resolved to
 *  a single literal href up front. */
export async function rewriteDashManifest(
  manifest: string,
  manifestUrl: string,
  ctx: ManifestRewriteContext,
): Promise<string> {
  if (SEGMENT_TEMPLATE_RE.test(manifest)) {
    return rewriteDashBaseUrlAsPrefix(manifest, manifestUrl, ctx);
  }

  const rawUris = new Set<string>();
  for (const match of manifest.matchAll(BASE_URL_RE)) rawUris.add(match[1].trim());
  for (const match of manifest.matchAll(DASH_ATTR_RE)) rawUris.add(match[2]);

  const hrefByRaw = await resolveHrefs(rawUris, manifestUrl, ctx);
  return manifest
    .replace(
      BASE_URL_RE,
      (_match, raw: string) => `<BaseURL>${hrefByRaw.get(raw.trim()) ?? raw}</BaseURL>`,
    )
    .replace(
      DASH_ATTR_RE,
      (_match, attr: string, raw: string) => `${attr}="${hrefByRaw.get(raw) ?? raw}"`,
    );
}

/**
 * Rewrites `<BaseURL>` to a proxy *prefix* that authorizes fetching any
 * sub-path beneath the original base, for manifests whose segments are
 * addressed by a `SegmentTemplate` the client expands itself.
 *
 * The minted token must survive the client's own relative-URL resolution
 * (`new URL(relativeSegment, baseUrl)`), which — per standard URL
 * resolution rules — drops any query string on the base and replaces only
 * the base's final path segment. A token carried as a query parameter
 * would therefore be silently discarded before the request ever reaches
 * us. Embedding the token as a *path segment* with a trailing slash on the
 * base survives that resolution: `.../binary/{token}/` + `chunk-12.m4s` →
 * `.../binary/{token}/chunk-12.m4s`, preserving the token intact.
 *
 * This authorizes the whole representation's segment set under one token
 * rather than one token per segment — necessarily less granular than the
 * literal-URL path, but it's what SegmentTemplate's own addressing scheme
 * allows; see the streaming README's failure-modes section.
 */
async function rewriteDashBaseUrlAsPrefix(
  manifest: string,
  manifestUrl: string,
  ctx: ManifestRewriteContext,
): Promise<string> {
  const match = manifest.match(BASE_URL_RE);
  const rawBase = match?.[0]?.match(/<BaseURL>([^<]+)<\/BaseURL>/i)?.[1]?.trim();
  let absoluteBase: string;
  try {
    absoluteBase = new URL(rawBase ?? '.', manifestUrl).toString();
  } catch {
    absoluteBase = manifestUrl;
  }
  if (!absoluteBase.endsWith('/')) absoluteBase = `${absoluteBase.replace(/[^/]*$/, '')}`;

  const path = canonicalPath(
    ctx.variant.mediaId,
    ctx.variant.providerId,
    ctx.variant.variantId,
    'template',
    '',
  );
  const { token } = await mintProxyToken(
    { url: absoluteBase, headers: ctx.headers },
    ctx.ttlMs,
    path,
  );
  const prefix = `${proxyPath(ctx.variant, 'binary', 'template')}/${encodeURIComponent(token)}/`;

  const withRewrittenBase = rawBase
    ? manifest.replace(BASE_URL_RE, `<BaseURL>${prefix}</BaseURL>`)
    : `<BaseURL>${prefix}</BaseURL>\n${manifest}`;
  // media/initialization attributes stay as relative templates — they
  // resolve against the rewritten <BaseURL> in the client, unchanged here.
  return withRewrittenBase;
}
