import type { Transition } from 'motion/react';

// Shared transition/easing scale for every animation in the app. One scale
// keeps entrances consistent across the home page, the rails, and the
// modals, and gives reduced-motion users a uniform, calmer profile.
// `motion` ships an easeOutExpo-ish curve that reads as "settled" without
// feeling slow; `DURATIONS` tiers keep the perception of speed consistent.

/** Cinematic deceleration curve (expo-ish). Default for entrances. */
export const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];
/** Standard fast deceleration (Material-style ease-out). */
export const EASE_OUT: [number, number, number, number] = [0, 0, 0.2, 1];
/** Symmetric ease-in-out — reserved for loops and hover feels, not entrances. */
export const EASE_IN_OUT: [number, number, number, number] = [0.4, 0, 0.2, 1];

export const DURATIONS = {
  fast: 0.15,
  base: 0.25,
  slow: 0.45,
  page: 0.35,
} as const;

/** Snappy spring for micro-interactions (hover lift, icon pops, pills). */
export const SPRING: Transition = {
  type: 'spring',
  stiffness: 320,
  damping: 30,
  mass: 0.8,
};

/** Soft spring for large surfaces (sheets, modals, panels). */
export const SPRING_SOFT: Transition = {
  type: 'spring',
  stiffness: 200,
  damping: 26,
  mass: 1,
};

/** Shared whileInView viewport options — reveal once, when a fifth shows. */
export const VIEWPORT = { once: true, amount: 0.2 } as const;
