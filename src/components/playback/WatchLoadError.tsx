'use client';

import { useT } from '@/lib/i18n';

export function WatchLoadError() {
  const t = useT();
  return (
    <div className="pt-12 text-center text-sm text-muted-foreground">{t('watch.loadFailed')}</div>
  );
}
