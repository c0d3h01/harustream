import type { ProxyResourceKind } from './types';

export function manifestKind(contentType: string | null, url: string): 'hls' | 'dash' | null {
  const path = url.split('?', 1)[0].toLowerCase();
  const type = contentType ?? '';
  if (path.endsWith('.m3u8') || type.includes('mpegurl') || type.includes('apple.mpegurl')) {
    return 'hls';
  }
  if (path.endsWith('.mpd') || type.includes('dash+xml')) return 'dash';
  return null;
}

type HrefBuilder = (absoluteUrl: string, kind: ProxyResourceKind) => string;

function buildHrefMap(
  rawUris: Iterable<string>,
  manifestUrl: string,
  toHref: HrefBuilder,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const raw of rawUris) {
    let absolute: string;
    try {
      absolute = new URL(raw, manifestUrl).toString();
    } catch {
      continue;
    }
    map.set(raw, toHref(absolute, manifestKind(null, absolute) === null ? 'binary' : 'manifest'));
  }
  return map;
}

const URI_ATTR_RE = /URI="([^"]+)"/gi;

export function rewriteHlsManifest(
  manifest: string,
  manifestUrl: string,
  toHref: HrefBuilder,
): string {
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
  const hrefByRaw = buildHrefMap(rawUris, manifestUrl, toHref);
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
// $Number$, $Number%05d$, $SubNumber$, $Time$, $RepresentationID$, $Bandwidth$, ...
const SEGMENT_TEMPLATE_RE = /\$[A-Za-z]+(?:%0\d+d)?\$/;

export function rewriteDashManifest(
  manifest: string,
  manifestUrl: string,
  toHref: HrefBuilder,
): string {
  if (SEGMENT_TEMPLATE_RE.test(manifest)) {
    // A templated BaseURL must stay a directory prefix: the player resolves
    // `seg-$Number$.m4s` against it, so the href has to end in a slash.
    const rawBase = manifest.match(/<BaseURL>([^<]+)<\/BaseURL>/i)?.[1]?.trim();
    let base: string;
    try {
      base = new URL(rawBase ?? '.', manifestUrl).toString();
    } catch {
      base = manifestUrl;
    }
    // The trailing slash survives only outside the encoded segment: the player
    // resolves `seg-$Number$.m4s` against this, and without it the last path
    // segment would be replaced instead of appended to.
    const prefix = `${toHref(base.endsWith('/') ? base : `${base.replace(/[^/]*$/, '')}`, 'binary')}/`;
    return rawBase
      ? manifest.replace(/<BaseURL>[^<]+<\/BaseURL>/gi, `<BaseURL>${prefix}</BaseURL>`)
      : `<BaseURL>${prefix}</BaseURL>\n${manifest}`;
  }

  const rawUris = new Set<string>();
  for (const match of manifest.matchAll(/<BaseURL>([^<]+)<\/BaseURL>/gi))
    rawUris.add(match[1].trim());
  for (const match of manifest.matchAll(DASH_ATTR_RE)) rawUris.add(match[2]);
  const hrefByRaw = buildHrefMap(rawUris, manifestUrl, toHref);
  return manifest
    .replace(
      /<BaseURL>([^<]+)<\/BaseURL>/gi,
      (_match, raw: string) => `<BaseURL>${hrefByRaw.get(raw.trim()) ?? raw}</BaseURL>`,
    )
    .replace(
      DASH_ATTR_RE,
      (_match, attr: string, raw: string) => `${attr}="${hrefByRaw.get(raw) ?? raw}"`,
    );
}
