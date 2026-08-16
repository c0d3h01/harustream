// Runtime provider registry. No provider data is compiled into the source or
// read from env — the app fetches the live provider list from the upstream
// API (`GET /api/providers`) and registers it here so every consumer (the
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

export function isValidProvider(id: unknown): id is string {
  return typeof id === 'string' && available.some((p) => p.id === id);
}

export function providerById(id: string | undefined): Provider | undefined {
  return available.find((p) => p.id === id);
}
