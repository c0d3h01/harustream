'use client';

import type { ReactNode } from 'react';
import { useT } from '@/lib/i18n';

export function SearchHero({ children }: { children: ReactNode }) {
  const t = useT();
  return (
    <section className="mx-auto max-w-3xl pt-16 sm:pt-24">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">
        {t('search.eyebrow')}
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
        {t('search.pageHeading')}
      </h1>
      <p className="mt-4 text-sm leading-6 text-muted-foreground">{t('search.pageSub')}</p>
      <div className="mt-8">{children}</div>
    </section>
  );
}
