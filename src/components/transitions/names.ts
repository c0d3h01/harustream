export function posterTransitionName(providerId: string, ref: string): string {
  const clean = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80);
  return `media-poster-${clean(providerId)}-${clean(ref)}`;
}
