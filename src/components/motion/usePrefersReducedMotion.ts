'use client';

import { useReducedMotion } from 'motion/react';

// Shared prefers-reduced-motion hook. `MotionConfig reducedMotion="user"`
// in App already disables the transform half of every animation app-wide;
// this hook exists for the places where that isn't enough — dropping the
// *layout-affecting* variant itself (y offsets, stagger delays) so reduced-
// motion users get a flat, instant reveal instead of a flattened one.
export function usePrefersReducedMotion(): boolean {
  return useReducedMotion() ?? false;
}
