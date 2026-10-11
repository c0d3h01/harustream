'use client';

import { useEffect } from 'react';
import { TIMEZONE_COOKIE } from '@/lib/viewer';

/**
 * Publishes the visitor's own timezone so server-side provider requests can use
 * it. Without this the server only knows the deployment's zone, which would be
 * a value we invented rather than the visitor's.
 */
export function ViewerTimezone() {
  useEffect(() => {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!timeZone) return;
    // biome-ignore lint/suspicious/noDocumentCookie: publishing the visitor's own timezone for server-side provider requests is this component's whole purpose; the value is not a credential.
    document.cookie = `${TIMEZONE_COOKIE}=${encodeURIComponent(timeZone)}; path=/; max-age=31536000; samesite=lax`;
  }, []);
  return null;
}
