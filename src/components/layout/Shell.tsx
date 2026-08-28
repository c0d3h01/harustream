'use client';

import { Bell, CircleUserRound, Search } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { localeHref, useLocale } from '@/lib/i18n';
import { HeaderSearch } from './HeaderSearch';
import { SiteNav } from './SiteNav';

export function Shell({ children }: { children: ReactNode }) {
  const { locale } = useLocale();
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center gap-6 px-4 sm:px-6 lg:px-10">
          <Link
            href={localeHref(locale, '/')}
            className="group inline-flex shrink-0 items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Image
              src="/favicon/icon.png"
              alt="HaruStream home"
              width={32}
              height={32}
              className="size-8 rounded-lg transition group-hover:scale-105"
            />
            <span className="hidden text-lg font-bold tracking-[-0.04em] sm:inline">
              haru<span className="text-primary">stream</span>
            </span>
          </Link>
          <nav
            className="hidden items-center gap-6 text-sm font-medium text-muted-foreground lg:flex"
            aria-label="Main navigation"
          >
            <Link href={localeHref(locale, '/')} className="transition hover:text-foreground">
              Home
            </Link>
            <Link href={localeHref(locale, '/search')} className="transition hover:text-foreground">
              Movies
            </Link>
            <Link href={localeHref(locale, '/search')} className="transition hover:text-foreground">
              Series
            </Link>
            <Link
              href={localeHref(locale, '/library')}
              className="transition hover:text-foreground"
            >
              My Space
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <div className="hidden sm:block">
              <HeaderSearch />
            </div>
            <Link
              href={localeHref(locale, '/search')}
              aria-label="Search"
              className="grid size-11 place-items-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-foreground sm:hidden"
            >
              <Search className="size-5" />
            </Link>
            <button
              type="button"
              aria-label="Notifications"
              className="hidden size-11 place-items-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-foreground sm:grid"
            >
              <Bell className="size-5" />
            </button>
            <Link
              href={localeHref(locale, '/settings')}
              aria-label="Profile and settings"
              className="grid size-10 place-items-center rounded-full border border-border bg-secondary text-muted-foreground transition hover:border-primary hover:text-foreground"
            >
              <CircleUserRound className="size-5" />
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto min-h-screen w-full max-w-[1440px] px-4 pb-28 sm:px-6 lg:px-10">
        {children}
      </main>
      <SiteNav />
    </div>
  );
}
