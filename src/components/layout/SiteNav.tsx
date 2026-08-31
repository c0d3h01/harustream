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

/**
 * Glass dock (macOS-style) bottom navigation.
 *
 *  - Liquid glass: strongly frosted translucent surface (`backdrop-blur`) so
 *    content passes through but stays readable, with a hairline top highlight
 *    and soft outer shadow for the "edge of glass" depth.
 *  - Icons: plain outline glyphs, no magnification animation. Sized to feel
 *    compact — smaller on mobile, stepping up on tablet and desktop.
 *  - Labels: hidden on mobile to keep the dock tight; on tablet and up they
 *    appear as floating tooltips on hover / keyboard focus (statically sized
 *    slots keep ~44px+ touch/pointer targets on small screens).
 *  - Active: a soft pill behind the icon plus a small below-dot (desktop).
 */
export function SiteNav() {
  const pathname = usePathname();
  const t = useT();
  const { locale } = useLocale();

  return (
    <nav
      aria-label={t('nav.primary')}
      className="fixed bottom-[var(--safe-bottom)] left-1/2 z-40 -translate-x-1/2"
    >
      <ul
        className={cn(
          'scrollbar-none flex max-w-[calc(100vw-1.5rem)] items-end overflow-x-auto rounded-[1.75rem]',
          // Liquid glass — translucent, strongly frosted, hairline glass edge,
          // soft outer glow. bg-card/40 + backdrop-blur keeps it see-through
          // yet readable over any surface.
          'border border-white/10 bg-card/40 backdrop-blur-2xl',
          'shadow-[0_16px_40px_-12px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.08)]',
          // Compact on mobile, easing out on tablet and desktop.
          'gap-1.5 px-2 py-1.5 sm:gap-2 sm:px-2.5 sm:py-2 lg:gap-2.5 lg:px-3 lg:py-2.5',
        )}
      >
        {links.map(({ href, label, icon: Icon }) => {
          const localized = localeHref(locale, href);
          // Active state compares against the bare path so /ja/library still
          // highlights "My list".
          const bare = stripLocalePrefix(pathname);
          const active = href === '/' ? bare === '/' : bare.startsWith(href);

          return (
            <li key={href} className="relative flex items-end">
              <Link
                href={localized}
                aria-label={t(label)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group relative flex min-w-11 flex-col items-center justify-end gap-1 overflow-visible rounded-2xl px-2 pb-1.5 pt-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-w-12 lg:min-w-14',
                  // Prevent double-tap zoom delay on touch.
                  'touch-action:manipulation',
                  active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {/* Label tooltip — hidden on mobile, hover/focus reveal on
                    tablet and up. */}
                <span
                  aria-hidden="true"
                  className={cn(
                    'pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 hidden whitespace-nowrap rounded-lg border border-white/10 bg-background/80 px-2.5 py-1 text-[11px] font-medium text-foreground shadow-lg shadow-black/30 backdrop-blur-md sm:block',
                    'opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100',
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
                  {/* Active soft pill behind the icon. */}
                  <span
                    className={cn(
                      'absolute inset-0 -m-1.5 rounded-xl transition-opacity duration-200',
                      active ? 'bg-primary/15 opacity-100' : 'opacity-0',
                    )}
                    aria-hidden="true"
                  />
                  <Icon
                    className={cn('relative', 'size-[1.4rem] sm:size-6 lg:size-7')}
                    strokeWidth={1.8}
                    aria-hidden="true"
                  />
                  {/* Active indicator dot — desktop only. */}
                  <span
                    className={cn(
                      'absolute -bottom-2 left-1/2 hidden size-1 -translate-x-1/2 rounded-full bg-current transition-opacity lg:block',
                      active ? 'opacity-100' : 'opacity-0',
                    )}
                    aria-hidden="true"
                  />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
