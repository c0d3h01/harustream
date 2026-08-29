'use client';

import { Bookmark, Home, Search, Settings } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { localeHref, stripLocalePrefix, type TranslationKey, useLocale, useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';

const links = [
  { href: '/', label: 'nav.browse', icon: Home },
  { href: '/search', label: 'nav.search', icon: Search },
  { href: '/library', label: 'nav.myList', icon: Bookmark },
  { href: '/settings', label: 'nav.settings', icon: Settings },
] as const satisfies readonly { href: string; label: TranslationKey; icon: typeof Home }[];

export function SiteNav() {
  const pathname = usePathname();
  const t = useT();
  const { locale } = useLocale();
  return (
    <nav
      aria-label={t('nav.primary')}
      className="fixed bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] left-1/2 z-40 -translate-x-1/2"
    >
      {/* min-w scales down on ≤360px phones so all five items fit without
          clipping; scrollbar-none keeps the overflow fallback clean. */}
      <ul className="scrollbar-none flex max-w-[calc(100vw-1.5rem)] items-center gap-0.5 overflow-x-auto rounded-2xl border border-border/70 bg-card/95 p-1.5 shadow-2xl shadow-background/50 sm:gap-2 sm:px-2">
        {links.map(({ href, label, icon: Icon }) => {
          const localized = localeHref(locale, href);
          // Active state compares against the bare path so /ja/library still
          // highlights "My list".
          const bare = stripLocalePrefix(pathname);
          const active = href === '/' ? bare === '/' : bare.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={localized}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group flex min-w-14 flex-col items-center gap-1 rounded-xl px-3 py-2 text-[11px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-w-16',
                  active
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                )}
              >
                <span className="relative">
                  <Icon className="size-4.5" aria-hidden="true" />
                </span>
                {t(label)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
