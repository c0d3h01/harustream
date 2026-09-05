'use client';

import { Bookmark, Home, Search, Settings } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SPRING } from '@/components/motion/transitions';
import { localeHref, stripLocalePrefix, type TranslationKey, useLocale, useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';

const links = [
  { href: '/', label: 'nav.browse', icon: Home },
  { href: '/search', label: 'nav.search', icon: Search },
  { href: '/library', label: 'nav.myList', icon: Bookmark },
  { href: '/settings', label: 'nav.settings', icon: Settings },
] as const satisfies readonly { href: string; label: TranslationKey; icon: typeof Home }[];

/**
 * Glass dock (macOS-style) bottom navigation.
 *
 * Interaction motion only (no render entrance):
 * - Active pill morphs between tabs via `layoutId` (tap a tab → pill glides).
 * - Icons tap-scale via `whileTap` for tactile feedback.
 * - Page slides are deliberately OFF for dock tabs (lateral, no depth) —
 *   `DirectionalTransition` resolves untyped navigations to `default: "none"`.
 * - The dock itself is isolated from page slides via `viewTransitionName`.
 */
export function SiteNav() {
  const pathname = usePathname();
  const t = useT();
  const { locale } = useLocale();

  return (
    <nav
      aria-label={t('nav.primary')}
      className="fixed bottom-[var(--safe-bottom)] left-1/2 z-40 -translate-x-1/2"
      style={{ viewTransitionName: 'site-dock' }}
    >
      <ul
        className={cn(
          'scrollbar-none glass-dock glass-specular flex max-w-[calc(100vw-1.5rem)] items-end overflow-x-auto rounded-[1.75rem]',
          'gap-1.5 px-2 py-1.5 sm:gap-2 sm:px-2.5 sm:py-2 lg:gap-2.5 lg:px-3 lg:py-2.5',
        )}
      >
        {links.map(({ href, label, icon: Icon }) => {
          const localized = localeHref(locale, href);
          const bare = stripLocalePrefix(pathname);
          const active = href === '/' ? bare === '/' : bare.startsWith(href);

          return (
            <li key={href} className="relative flex items-end">
              <motion.span whileTap={{ scale: 0.88 }} transition={SPRING} className="flex">
                <Link
                  href={localized}
                  aria-label={t(label)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'group relative flex min-w-11 flex-col items-center justify-end gap-1 overflow-visible rounded-2xl px-2 pb-1.5 pt-2 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-w-12 lg:min-w-14',
                    'touch-action:manipulation',
                    active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 hidden whitespace-nowrap rounded-lg glass-chip px-2.5 py-1 text-[11px] font-medium text-foreground shadow-lg shadow-black/30 sm:block',
                      'opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100',
                    )}
                  >
                    {t(label)}
                  </span>

                  <span
                    className={cn(
                      'relative flex items-center justify-center',
                      'size-[1.4rem] sm:size-6 lg:size-7',
                    )}
                  >
                    {/* Active pill — single layoutId glides between tabs on tap. */}
                    {active && (
                      <motion.span
                        layoutId="dock-active-pill"
                        transition={SPRING}
                        className="absolute inset-0 -m-1.5 rounded-xl bg-primary/15"
                        aria-hidden="true"
                      />
                    )}
                    <Icon
                      className={cn('relative', 'size-[1.4rem] sm:size-6 lg:size-7')}
                      strokeWidth={1.8}
                      aria-hidden="true"
                    />
                    <span
                      className={cn(
                        'absolute -bottom-2 left-1/2 hidden size-1 -translate-x-1/2 rounded-full bg-current transition-opacity duration-200 lg:block',
                        active ? 'opacity-100' : 'opacity-0',
                      )}
                      aria-hidden="true"
                    />
                  </span>
                </Link>
              </motion.span>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
