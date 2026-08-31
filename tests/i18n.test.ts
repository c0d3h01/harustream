import { describe, expect, it } from 'vitest';
import { dictionaries } from '@/lib/i18n/dictionaries';
import { en, type TranslationKey } from '@/lib/i18n/dictionary';
import { localeHref, stripLocalePrefix } from '@/lib/i18n/links';
import {
  matchLocale,
  matchLocaleFromTags,
  parseAcceptLanguage,
  readLocalePreference,
  resolveRequestLocale,
} from '@/lib/i18n/resolve';

describe('locale-prefixed links', () => {
  it('prefixes app paths with the active locale', () => {
    expect(localeHref('en', '/settings')).toBe('/en/settings');
    expect(localeHref('hi', '/search?q=naruto')).toBe('/hi/search?q=naruto');
    expect(localeHref('ja', '/watch/movieBoxWeb/abc?episode=e1')).toBe(
      '/ja/watch/movieBoxWeb/abc?episode=e1',
    );
  });

  it('keeps the root suffix-free', () => {
    expect(localeHref('es', '/')).toBe('/es');
  });

  it('strips known locale prefixes and passes bare paths through', () => {
    expect(stripLocalePrefix('/de/library')).toBe('/library');
    expect(stripLocalePrefix('/fr')).toBe('/');
    expect(stripLocalePrefix('/settings')).toBe('/settings');
    // Not a supported locale: leave alone (e.g. /enigma is a real path).
    expect(stripLocalePrefix('/enigma')).toBe('/enigma');
  });
});

describe('accept-language parsing', () => {
  it('parses tags with quality values', () => {
    expect(parseAcceptLanguage('en-US,en;q=0.5')).toEqual([
      { tag: 'en-US', quality: 1 },
      { tag: 'en', quality: 0.5 },
    ]);
  });

  it('drops wildcards and zero-quality entries', () => {
    expect(parseAcceptLanguage('*, fr;q=0, de;q=0.0')).toEqual([]);
  });
});

describe('locale negotiation', () => {
  it('matches exact and region-subtagged languages', () => {
    expect(matchLocale('ja-JP,ja;q=0.9,en;q=0.8')).toBe('ja');
    expect(matchLocale('fr-CH,fr;q=0.9,en;q=0.8')).toBe('fr');
    expect(matchLocale('de-DE')).toBe('de');
    expect(matchLocale('EN-us')).toBe('en');
  });

  it('falls back to the default locale for unsupported languages', () => {
    expect(matchLocale('zh-CN,zh;q=0.9')).toBe('en');
    expect(matchLocale('')).toBe('en');
    expect(matchLocale(null)).toBe('en');
  });

  it('respects quality ordering', () => {
    // Spanish outranks German even though German is listed first.
    expect(matchLocale('de;q=0.4, es;q=0.9')).toBe('es');
  });

  it('matches navigator.languages tag lists directly', () => {
    expect(matchLocaleFromTags(['hi-IN', 'hi', 'en'])).toBe('hi');
    expect(matchLocaleFromTags([])).toBe('en');
    expect(matchLocaleFromTags(undefined)).toBe('en');
  });
});

describe('cookie preference resolution', () => {
  it('treats a missing or unknown cookie as browser-default', () => {
    expect(readLocalePreference(undefined)).toBe('auto');
    expect(readLocalePreference(null)).toBe('auto');
    expect(readLocalePreference('klingon')).toBe('auto');
  });

  it('keeps supported explicit choices', () => {
    expect(readLocalePreference('ja')).toBe('ja');
  });

  it('an explicit choice overrides accept-language; auto negotiates', () => {
    expect(resolveRequestLocale('de', 'ja-JP,ja;q=0.9')).toBe('de');
    expect(resolveRequestLocale('auto', 'ja-JP,ja;q=0.9')).toBe('ja');
  });
});

describe('dictionaries', () => {
  const expectedKeys = Object.keys(en) as TranslationKey[];

  it('every locale defines every key with non-empty text', () => {
    for (const [locale, dict] of Object.entries(dictionaries)) {
      expect(Object.keys(dict), locale).toEqual(expect.arrayContaining(expectedKeys));
      expect(Object.keys(dict), locale).toHaveLength(expectedKeys.length);
      for (const key of expectedKeys) {
        expect(typeof dict[key], `${locale}:${key}`).toBe('string');
        expect(dict[key].length > 0, `${locale}:${key}`).toBe(true);
      }
    }
  });

  it('interpolation tokens survive translation into every locale', () => {
    expect(en['home.titlesCount'].includes('{count}')).toBe(true);
    for (const [locale, dict] of Object.entries(dictionaries)) {
      expect(dict['home.titlesCount'], locale).toContain('{count}');
      expect(dict['home.posterAlt'], locale).toContain('{title}');
    }
  });
});
