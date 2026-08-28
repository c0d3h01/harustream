'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { localeHref, useLocale } from '@/lib/i18n';
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
          <div className="ml-auto hidden sm:block">
            <span className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
              HaruStream
            </span>
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
