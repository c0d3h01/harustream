import {
  DEFAULT_LOCALE,
  hasLanguagePreference,
  hasLocale,
  type LanguagePreference,
  LOCALES,
  type Locale,
} from './config';

/** Pure locale negotiation shared by the server (Accept-Language + cookie)
 *  and the client (navigator.languages). No dependencies: a small BCP47
 *  base-matching rule covers everything this app needs — exact tags win,
 *  then primary subtags (en-US → en), and anything unknown falls back to
 *  the default locale. */

export function parseAcceptLanguage(header: string): Array<{ tag: string; quality: number }> {
  return header
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [tag, ...params] = part.split(';');
      let quality = 1;
      for (const param of params) {
        const [name, value] = param.split('=').map((side) => side.trim().toLowerCase());
        if (name === 'q') {
          const parsed = Number.parseFloat(value);
          if (Number.isFinite(parsed)) quality = parsed;
        }
      }
      return { tag: tag.trim(), quality };
    })
    .filter((entry) => entry.tag && entry.tag !== '*' && entry.quality > 0)
    .sort((left, right) => right.quality - left.quality);
}

function matchesLocale(tag: string, locale: Locale): boolean {
  const normalized = tag.trim().toLowerCase();
  return normalized === locale || normalized.split('-')[0] === locale;
}

/** Picks the first supported locale from an ordered list of language tags
 *  (already priority-ordered, e.g. navigator.languages). */
export function matchLocaleFromTags(tags: readonly string[] | undefined | null): Locale {
  if (!tags) return DEFAULT_LOCALE;
  for (const tag of tags) {
    for (const locale of LOCALES) {
      if (matchesLocale(tag, locale)) return locale;
    }
  }
  return DEFAULT_LOCALE;
}

/** Resolves the request's preferred locale from an Accept-Language header. */
export function matchLocale(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;
  return matchLocaleFromTags(parseAcceptLanguage(header).map((entry) => entry.tag));
}

/** Reads the persisted preference from the cookie value. Anything missing
 *  or unrecognized means "follow the browser". */
export function readLocalePreference(value: string | null | undefined): LanguagePreference {
  return typeof value === 'string' && hasLocale(value) ? value : 'auto';
}

/** Effective render locale for a request: explicit choice wins, otherwise
 *  negotiate against the browser's Accept-Language ordering. */
export function resolveRequestLocale(
  preference: LanguagePreference,
  acceptLanguage?: string | null,
): Locale {
  return preference === 'auto' ? matchLocale(acceptLanguage) : preference;
}

/** Rebuilds the LanguagePreference union at runtime for validation paths
 *  that start from untyped strings. */
export function toLanguagePreference(value: string): LanguagePreference | null {
  return hasLanguagePreference(value) ? value : null;
}
