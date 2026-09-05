'use client';

import { useT } from '@/lib/i18n';

/** Friendly state when TMDB_API_KEY is missing/invalid — never a stack trace. */
export function TmdbConfigNotice() {
  const t = useT();
  return (
    <section className="mx-auto grid max-w-2xl place-items-center px-6 py-24 text-center">
      <div>
        <p className="text-sm font-semibold text-primary">{t('tmdb.configHeading')}</p>
        <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
          {t('tmdb.configBody')}
        </p>
      </div>
    </section>
  );
}
