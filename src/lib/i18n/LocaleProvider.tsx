'use client';

import { useRouter } from 'next/navigation';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  DEFAULT_LOCALE,
  type LanguagePreference,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  type Locale,
} from './config';
import { getDictionary } from './dictionaries';
import { createTranslator, type Translator } from './dictionary';
import { stripLocalePrefix } from './links';
import { matchLocaleFromTags } from './resolve';

type LocaleContextValue = {
  /** Effective locale currently rendered. */
  locale: Locale;
  /** What the user picked in settings: 'auto' or a pinned locale. */
  preference: LanguagePreference;
  t: Translator;
  setPreference: (next: LanguagePreference) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

/** Detects the browser's preferred language for 'auto' mode. */
function detectClientLocale(): Locale {
  if (typeof navigator === 'undefined') return DEFAULT_LOCALE;
  const tags = navigator.languages?.length ? navigator.languages : [navigator.language];
  return matchLocaleFromTags(tags);
}

/** Persists the choice for SSR; clearing the cookie restores browser-default. */
function writeLocalePreference(next: LanguagePreference): void {
  const value =
    next === 'auto'
      ? `${LOCALE_COOKIE}=; max-age=0; path=/`
      : `${LOCALE_COOKIE}=${next}; max-age=${LOCALE_COOKIE_MAX_AGE}; path=/`;
  // biome-ignore lint/suspicious/noDocumentCookie: document.cookie is synchronous and universal; the async Cookie Store API is not (Safari/Firefox support gaps).
  document.cookie = value;
}

export function LocaleProvider({
  locale: initialLocale,
  preference: initialPreference,
  children,
}: {
  locale: Locale;
  preference: LanguagePreference;
  children: ReactNode;
}) {
  const router = useRouter();
  const [state, setState] = useState({ locale: initialLocale, preference: initialPreference });
  const t = useMemo(() => createTranslator(getDictionary(state.locale)), [state.locale]);

  const setPreference = useCallback(
    (next: LanguagePreference) => {
      const locale = next === 'auto' ? detectClientLocale() : next;
      writeLocalePreference(next);
      setState({ locale, preference: next });
      // Locale lives in the URL: move this page to the new /{lang}/... route,
      // preserving everything after the current locale segment (and query).
      const { pathname, search } = window.location;
      const rest = stripLocalePrefix(pathname);
      router.replace(`/${locale}${rest === '/' ? '' : rest}${search}`);
    },
    [router],
  );

  // Keep <html lang> in sync after client-side switches so screen readers
  // and browser translation prompts follow the visible language.
  useEffect(() => {
    document.documentElement.lang = state.locale;
  }, [state.locale]);

  const value = useMemo(() => ({ ...state, t, setPreference }), [state, t, setPreference]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) throw new Error('useLocale must be used within <LocaleProvider>');
  return context;
}

/** Convenience hook for components that only translate strings. */
export function useT(): Translator {
  return useLocale().t;
}
