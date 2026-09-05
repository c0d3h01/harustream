'use client';

import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { localeHref, useLocale, useT } from '@/lib/i18n';

/** Compact header search bar. Submits to /{lang}/search?q=…, which the search
 *  page reads to prefill its main SearchBox and run the query. Uncontrolled on
 *  purpose: no useSearchParams here, so static pages can prerender Shell
 *  without a Suspense boundary. */
export function HeaderSearch() {
  const router = useRouter();
  const t = useT();
  const { locale } = useLocale();
  return (
    <search className="relative min-w-0 flex-1 justify-self-end sm:max-w-xs">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const next = String(new FormData(event.currentTarget).get('q') ?? '')
            .trim()
            .slice(0, 200);
          router.push(
            localeHref(locale, next ? `/search?q=${encodeURIComponent(next)}` : '/search'),
          );
        }}
      >
        <label htmlFor="header-search" className="sr-only">
          {t('header.searchLabel')}
        </label>
        <Search
          className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          id="header-search"
          name="q"
          type="search"
          placeholder={t('header.searchPlaceholder')}
          autoComplete="off"
          enterKeyHint="search"
          className="glass-input h-11 w-full rounded-full pr-4 pl-10 text-sm outline-none transition-all duration-200 placeholder:text-muted-foreground hover:border-[var(--glass-border-strong)] focus:border-primary focus:ring-2 focus:ring-primary/20 [&::-webkit-search-cancel-button]:hidden"
        />
      </form>
    </search>
  );
}
