'use client';

import { useEffect } from 'react';
import { toast } from '@/components/ui/toast';
import { useT } from '@/lib/i18n';

const STORAGE_KEY = 'harustream:dev-notice-dismissed';

// One-time "under development" notice per browser session. Session storage
// (not local) so returning visitors in a new session are re-notified.
export function UnderDevelopmentToast() {
  const t = useT();
  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = sessionStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      // Storage can throw in private-mode browsers; show the notice anyway.
    }

    if (dismissed) return;

    // Let the first paint settle before the toast slides in.
    const timer = window.setTimeout(() => {
      toast.add({
        id: 'under-development',
        title: t('toast.devTitle'),
        description: t('toast.devBody'),
        type: 'warning',
        timeout: 8000,
        onClose() {
          try {
            sessionStorage.setItem(STORAGE_KEY, '1');
          } catch {
            // Ignore: worst case the notice shows again next load.
          }
        },
      });
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [t]);

  return null;
}
