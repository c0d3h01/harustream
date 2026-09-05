'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { localeHref, useLocale } from '@/lib/i18n';
import { HeaderSearch } from './HeaderSearch';
import { SiteNav } from './SiteNav';

export function Shell({ children }: { children: ReactNode }) {
  const { locale } = useLocale();
  return (
    <>
      <div className="min-h-screen bg-background">
        {/* Fluid island — persistent chrome, isolated from page slides via
            `viewTransitionName: site-header` (see globals.css). Stays fixed
            while page content slides underneath on nav-forward/nav-back. */}
        <header
          className="sticky top-0 z-40 px-3 pt-[max(0.625rem,env(safe-area-inset-top))] sm:px-5"
          style={{ viewTransitionName: 'site-header' }}
        >
          <div className="glass-header glass-specular mx-auto flex h-16 w-full max-w-[1440px] items-center gap-3 rounded-[1.25rem] px-3.5 sm:h-[4.5rem] sm:rounded-full sm:px-5 lg:px-6">
            <Link
              href={localeHref(locale, '/')}
              className="group inline-flex shrink-0 items-center gap-2.5 rounded-full transition-transform duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Image
                src="/favicon/icon.png"
                alt="HaruStream home"
                width={32}
                height={32}
                className="size-8 rounded-full transition duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:scale-105 group-active:scale-95"
              />
              <span className="text-[1.05rem] font-bold tracking-[-0.05em] sm:text-xl">
                haru<span className="text-primary">stream</span>
              </span>
            </Link>
            <div className="ml-auto flex min-w-0 flex-1 justify-end sm:flex-none">
              <HeaderSearch />
            </div>
          </div>
        </header>
        {/* Lifted above the fixed ambient hero backdrop (z-0) so page
            content always paints over the page-wide blur tint. */}
        <main className="relative z-[1] mx-auto min-h-screen w-full max-w-[1440px] px-4 pb-28 sm:px-6 lg:px-10">
          {children}
        </main>
      </div>
      <SiteNav />
    </>
  );
}
