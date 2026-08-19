// Runtime provider registry. No provider data is compiled into the source —
// the app fetches the live provider list from the manifest-backed
// `GET /api/providers` route and registers it here so every consumer (the
// picker, playback fallback, display names, persisted-setting validation)
// sees the same real-time data. Before the first fetch lands the registry is
// empty; nothing falls back to a hardcoded list.

export type Provider = {
  id: string;
  name: string;
  type: string;
  version?: string;
};

let available: Provider[] = [];

/** Replace the registered provider list (called on every live fetch). */
export function setAvailableProviders(list: Provider[]): void {
  available = list;
}

/** The last known live provider list. */
export function getAvailableProviders(): Provider[] {
  return available;
}

// Provider ids are matched case-insensitively — the persisted default is the
// lowercase 'vega' while the manifest serves it as "Vega".
export function isValidProvider(id: unknown): id is string {
  if (typeof id !== 'string') return false;
  const needle = id.toLowerCase();
  return available.some((p) => p.id.toLowerCase() === needle);
}

export function providerById(id: string | undefined): Provider | undefined {
  if (!id) return undefined;
  const needle = id.toLowerCase();
  return available.find((p) => p.id.toLowerCase() === needle);
}
