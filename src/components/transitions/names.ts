/**
 * Shared `<ViewTransition name>` helpers.
 *
 * Names must be globally unique and valid CSS idents — provider refs can
 * contain slashes, colons and spaces, so they are sanitized. Both sides of
 * a morph (list card ↔ detail hero) must call the same helper with the same
 * provider + ref or the pair silently never forms.
 */

/** Poster morph: MediaCard (list) ↔ TitleHeader (detail). Same thing, deeper. */
export function posterTransitionName(providerId: string, ref: string): string {
  const clean = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80);
  return `media-poster-${clean(providerId)}-${clean(ref)}`;
}

/** Title text morph: card title ↔ detail heading (avoids raster ghosting). */
export function titleTransitionName(providerId: string, ref: string): string {
  const clean = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80);
  return `media-title-${clean(providerId)}-${clean(ref)}`;
}
