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
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 pt-safe sm:px-6 lg:px-8">
        <Link
          href={localeHref(locale, '/')}
          className="mt-4 inline-flex h-11 items-center gap-2.5 rounded-full border border-border/70 bg-card/70 px-3.5 text-sm font-semibold tracking-tight backdrop-blur focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Image
            src="/favicon/icon.png"
            alt=""
            width={24}
            height={24}
            className="size-6 rounded-md"
          />
          harustream
        </Link>
        <HeaderSearch />
      </header>
      <main className="mx-auto min-h-screen w-full max-w-7xl px-4 pb-32 sm:px-6 lg:px-8">
        {children}
      </main>
      <SiteNav />
    </>
  );
}
