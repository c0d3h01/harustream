'use client';

import { useEffect } from 'react';

// Body scroll lock shared by every fullscreen overlay (detail and player
// modals). A naive per-component "capture previous value, restore on unmount"
// breaks when modals mount/unmount nested: the later mount captures the
// earlier lock as its "previous" value, and its unmount restores the lock
// permanently. Counting keeps the original value around until the last
// holder releases it, regardless of mount order.

let lockCount = 0;
let originalOverflow: string | null = null;

export function useScrollLock(active = true) {
  useEffect(() => {
    if (!active) return;
    if (lockCount === 0) {
      originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    lockCount += 1;
    return () => {
      lockCount -= 1;
      if (lockCount === 0 && originalOverflow !== null) {
        document.body.style.overflow = originalOverflow;
        originalOverflow = null;
      }
    };
  }, [active]);
}
