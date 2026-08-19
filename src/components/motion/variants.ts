import type { Variants } from 'motion/react';
import { DURATIONS, EASE } from './transitions';

// Shared variant presets. Only `transform` and `opacity` are ever animated:
// both are compositor-friendly and skip layout/paint work. `MotionConfig
// reducedMotion="user"` (set in App) disables the transform half for users
// who prefer reduced motion; the components that pick variants explicitly
// (e.g. Hero) also swap in the plain `fadeIn` preset via
// `usePrefersReducedMotion`.

/** Pure opacity fade — the reduced-motion-safe preset. */
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: DURATIONS.base, ease: EASE } },
};

/** Fade + rise. Used for staggered content that reads better with motion. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATIONS.base, ease: EASE },
  },
};

/** Container orchestration: children reveal in sequence. */
export const staggerContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.08 } },
};

/** whileInView fade+rise — for sections below the fold. */
export const viewFadeUp: Variants = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { duration: DURATIONS.base, ease: EASE } },
};

/** whileInView scale entrance — for cards and panels that grow into place. */
export const viewScaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: DURATIONS.base, ease: EASE },
  },
};

/** Sparse stagger for a handful of siblings (headers, button rows). */
export const viewStagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};
