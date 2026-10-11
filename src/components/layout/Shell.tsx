import { Search } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { HeaderSearch } from './HeaderSearch';
import { NavLinks } from './NavLinks';
import { SiteNav } from './SiteNav';

export function Shell({ children }: { children: ReactNode }) {
  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground focus:outline-none"
      >
        Skip to content
      </a>
      <div className="min-h-screen w-full overflow-x-clip bg-background">
        <header
          className="site-header sticky top-0 z-40"
          style={{ viewTransitionName: 'site-header' }}
        >
          <div className="content-gutter flex h-14 items-center gap-4 sm:h-16 lg:gap-6">
            <Link
              href="/"
              className="group inline-flex shrink-0 items-center gap-2.5 rounded-md transition-transform duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

            <NavLinks />

            <div className="ml-auto hidden min-w-0 md:block md:w-full md:max-w-xs">
              <HeaderSearch />
            </div>
            <Link
              href="/search"
              aria-label={'Search titles'}
              className="ml-auto grid size-10 shrink-0 place-items-center rounded-md text-foreground transition-colors hover:bg-muted active:scale-95 md:hidden"
            >
              <Search className="size-5" aria-hidden="true" />
            </Link>
          </div>
        </header>
        <main id="main-content" className="relative z-page min-h-dvh w-full pb-24 md:pb-0">
          {children}
        </main>
      </div>
      <SiteNav />
    </>
  );
}
