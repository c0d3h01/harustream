'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { localeHref, useLocale, useT } from '@/lib/i18n';

export function TitleLoadError() {
  const router = useRouter();
  const t = useT();
  const { locale } = useLocale();
  return (
    <div className="grid min-h-[60vh] place-items-center px-6 text-center">
      <div>
        <p className="text-sm font-semibold text-primary">{t('title.providerUnavailable')}</p>
        <h1 className="mt-2 text-3xl font-semibold">{t('title.loadFailedHeading')}</h1>
        <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
          {t('title.loadFailedBody')}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button
            onClick={() => router.refresh()}
            className="transition-transform duration-150 active:scale-[0.98]"
          >
            {t('errors.tryAgain')}
          </Button>
          <Button
            variant="outline"
            onClick={() => router.push(localeHref(locale, '/'), { transitionTypes: ['nav-back'] })}
            className="transition-transform duration-150 active:scale-[0.98]"
          >
            {t('errors.backToBrowse')}
          </Button>
        </div>
      </div>
    </div>
  );
}
