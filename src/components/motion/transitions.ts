// Shared transition/easing scale for every animation in the app. One scale
// keeps entrances consistent across the home page, the rails, and the
// modals, and gives reduced-motion users a uniform, calmer profile.
// `motion` ships an easeOutExpo-ish curve that reads as "settled" without
// feeling slow; `DURATIONS` tiers keep the perception of speed consistent.
export const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

export const DURATIONS = {
  fast: 0.15,
  base: 0.25,
  slow: 0.45,
} as const;
