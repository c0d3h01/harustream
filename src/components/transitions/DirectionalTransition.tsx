import { ViewTransition } from 'react';

/**
 * Page-level route transition.
 *
 * Hierarchical navigation (list → detail → watch) tags the navigation with
 * `nav-forward` / `nav-back` via `transitionTypes` on `<Link>` / `router`.
 * Lateral dock tabs carry no type and resolve to `default: "none"` — no
 * directional slide, so tabs never falsely imply depth. Shared-element
 * morphs (poster → hero) still apply on untyped navigations because they
 * use plain string `share` props, not type maps.
 *
 * Place in each **page component**, never in a layout — layouts persist
 * across navigations so enter/exit would never fire there.
 *
 * Always paired enter+exit + `default="none"` so Suspense reveals,
 * revalidations and background refreshes stay silent.
 */
export function DirectionalTransition({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition
      enter={{ 'nav-forward': 'nav-forward', 'nav-back': 'nav-back', default: 'none' }}
      exit={{ 'nav-forward': 'nav-forward', 'nav-back': 'nav-back', default: 'none' }}
      default="none"
    >
      {children}
    </ViewTransition>
  );
}
