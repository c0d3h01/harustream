import type { Locale } from '@/lib/i18n';

export interface TmdbLocale {
  /** TMDB `language` param (e.g. `ja-JP`). */
  language: string;
  /** TMDB `region`/`watch_region` param (e.g. `JP`). */
  region: string;
}

const MAP: Record<Locale, TmdbLocale> = {
  en: { language: 'en-US', region: 'US' },
  ja: { language: 'ja-JP', region: 'JP' },
  es: { language: 'es-ES', region: 'ES' },
  fr: { language: 'fr-FR', region: 'FR' },
  de: { language: 'de-DE', region: 'DE' },
  hi: { language: 'hi-IN', region: 'IN' },
};

/** App locale → TMDB language/region. Unknown locales fall back to en-US/US. */
export function tmdbLocale(locale: string): TmdbLocale {
  return (MAP as Record<string, TmdbLocale>)[locale] ?? MAP.en;
}
