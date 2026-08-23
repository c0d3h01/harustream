import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { SiteNav } from './SiteNav';

export function Shell({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 pt-safe sm:px-6 lg:px-8">
        <Link
          href="/"
          className="mt-4 inline-flex items-center gap-2.5 rounded-full border border-border/70 bg-card/70 px-3 py-1.5 text-sm font-semibold tracking-tight backdrop-blur"
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
        <Link
          href="/search"
          className="mt-4 rounded-full border border-border/70 bg-card/70 px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Search titles
        </Link>
      </header>
      <main className="mx-auto min-h-screen w-full max-w-7xl px-4 pb-32 sm:px-6 lg:px-8">
        {children}
      </main>
      <SiteNav />
    </>
  );
}
