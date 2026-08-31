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
        {/* Fluid island — detached glass pill (matches the bottom dock's liquid
            glass). Not an edge-to-edge bar: it floats with a safe-area inset so
            the page surface reads through, and stays sticky for utility. */}
        <header className="sticky top-0 z-40 px-3 pt-[max(0.625rem,env(safe-area-inset-top))] sm:px-5">
          <div className="mx-auto flex h-14 w-full max-w-[1440px] items-center gap-4 rounded-full border border-white/10 bg-card/40 px-4 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl sm:px-5">
            <Link
              href={localeHref(locale, '/')}
              className="group inline-flex shrink-0 items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Image
                src="/favicon/icon.png"
                alt="HaruStream home"
                width={32}
                height={32}
                className="size-8 rounded-full transition duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:scale-105"
              />
              <span className="text-lg font-bold tracking-[-0.04em]">
                haru<span className="text-primary">stream</span>
              </span>
            </Link>
            <div className="ml-auto flex min-w-0 flex-1 justify-end sm:flex-none">
              <HeaderSearch />
            </div>
          </div>
        </header>
        <main className="mx-auto min-h-screen w-full max-w-[1440px] px-4 pb-28 sm:px-6 lg:px-10">
          {children}
        </main>
      </div>
      <SiteNav />
    </>
  );
}
