'use client';

import { Bookmark, Home, Search, Settings } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const links = [
  { href: '/', label: 'Browse', icon: Home },
  { href: '/search', label: 'Search', icon: Search },
  { href: '/library', label: 'My list', icon: Bookmark },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const;

export function SiteNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] left-1/2 z-40 -translate-x-1/2"
    >
      <ul className="flex max-w-[calc(100vw-1.5rem)] items-center gap-1 overflow-x-auto rounded-2xl border border-border/70 bg-card/95 p-1.5 shadow-2xl shadow-background/50 sm:gap-2 sm:px-2">
        {links.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group flex min-w-16 flex-col items-center gap-1 rounded-xl px-3 py-2 text-[11px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                )}
              >
                <span className="relative">
                  <Icon className="size-4.5" aria-hidden="true" />
                </span>
                {label}
              </Link>
            </li>
          );
        })}
        <li>
          <a
            href="https://github.com/harusharu/harustream"
            target="_blank"
            rel="noreferrer"
            className="flex min-w-16 flex-col items-center gap-1 rounded-xl px-3 py-2 text-[11px] font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span aria-hidden="true" className="text-base leading-4">
              ◇
            </span>
            GitHub
          </a>
        </li>
      </ul>
    </nav>
  );
}
