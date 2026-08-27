'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { localeHref, useLocale, useT } from '@/lib/i18n';

export default function NotFound() {
  const router = useRouter();
  const t = useT();
  const { locale } = useLocale();
  return (
    <main className="grid min-h-screen place-items-center bg-background px-6 text-center text-foreground">
      <div>
        <p className="text-sm font-semibold text-primary">404</p>
        <h1 className="mt-2 text-3xl font-semibold">{t('errors.notFoundHeading')}</h1>
        <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
          {t('errors.notFoundBody')}
        </p>
        <div className="mt-6">
          <Button onClick={() => router.push(localeHref(locale, '/'))}>
            {t('errors.backHome')}
          </Button>
        </div>
      </div>
    </main>
  );
}
