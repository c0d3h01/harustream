import { LOCALES, type Locale } from './config';

/** Locale-prefixed URL helpers for the /{lang}/... route tree.
 *
 *  The route segment is the single source of truth for the rendered
 *  language; every internal link goes through localeHref so URLs always
 *  showcase the active locale (/en/settings, /ja/watch/...). */

export function localeHref(locale: Locale, path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  // Root stays suffix-free: /ja instead of /ja/
  return `/${locale}${clean === '/' ? '' : clean}`;
}

/** Removes a leading locale segment, returning the bare app path.
 *  Paths without a locale prefix pass through untouched. */
export function stripLocalePrefix(pathname: string): string {
  for (const locale of LOCALES) {
    if (pathname === `/${locale}`) return '/';
    if (pathname.startsWith(`/${locale}/`)) return pathname.slice(locale.length + 1);
  }
  return pathname;
}
