import type { Transition } from 'motion/react';

// Shared transition/easing scale for every animation in the app. One scale
// keeps entrances consistent across the home page, the rails, and the
// modals, and gives reduced-motion users a uniform, calmer profile.
// `motion` ships an easeOutExpo-ish curve that reads as "settled" without
// feeling slow.

/** Cinematic deceleration curve (expo-ish). Default for entrances. */
export const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

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
