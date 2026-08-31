'use client';

import { MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';

// Global motion configuration. `reducedMotion="user"` honors the OS-level
// reduce-motion preference: transform/layout animations are skipped while
// opacity fades still run, matching the contract documented in variants.ts.
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
