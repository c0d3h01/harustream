/** Supported app locales and the language preference model.
 *
 *  The explicit choice lives in a first-party cookie so the server can
 *  render the right dictionary during SSR (correct <html lang>, no
 *  post-hydration flash). With no cookie set, the request's Accept-Language
 *  header decides — the browser-language default. */

export const LOCALES = ['en', 'ja', 'es', 'fr', 'de', 'hi'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

export const LOCALE_COOKIE = 'harustream.locale';
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** What the settings control persists: follow the browser, or pin one locale. */
export const LANGUAGE_PREFERENCES = ['auto', ...LOCALES] as const;
export type LanguagePreference = (typeof LANGUAGE_PREFERENCES)[number];

/** Native names — always rendered in their own language, never translated. */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  ja: '日本語',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  hi: 'हिन्दी',
};

export function hasLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

export function hasLanguagePreference(value: string): value is LanguagePreference {
  return (LANGUAGE_PREFERENCES as readonly string[]).includes(value);
}
