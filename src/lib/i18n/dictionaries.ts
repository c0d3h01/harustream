import type { Locale } from './config';
import { type Dictionary, en } from './dictionary';
import { de } from './locales/de';
import { es } from './locales/es';
import { fr } from './locales/fr';
import { hi } from './locales/hi';
import { ja } from './locales/ja';

export const dictionaries: Record<Locale, Dictionary> = { en, ja, es, fr, de, hi };

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}
