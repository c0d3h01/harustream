// Client-safe provider registry. The provider list is configured at build
// time via NEXT_PUBLIC_PROVIDERS (a JSON array of { id, name, type }) and the
// default is chosen with NEXT_PUBLIC_DEFAULT_PROVIDER. No provider details
// are compiled into the source — point those env vars at any upstream that
// speaks the same API shape.

export type Provider = {
  id: string;
  name: string;
  type: string;
};

function parseProviders(): Provider[] {
  const raw = process.env.NEXT_PUBLIC_PROVIDERS;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is Provider =>
        !!p &&
        typeof p === 'object' &&
        typeof (p as Provider).id === 'string' &&
        typeof (p as Provider).name === 'string',
    );
  } catch {
    return [];
  }
}

export const PROVIDERS: Provider[] = parseProviders();

export const DEFAULT_PROVIDER_ID: string = (() => {
  const configured = process.env.NEXT_PUBLIC_DEFAULT_PROVIDER?.trim();
  // The configured default may be stale (e.g. a display name or a provider id
  // that no longer exists). Fall back to the first registered provider rather
  // than sending an unknown id to the upstream, which would 400 every request.
  if (configured && PROVIDERS.some((p) => p.id === configured)) {
    return configured;
  }
  return PROVIDERS[0]?.id || '';
})();

export function isValidProvider(id: unknown): id is string {
  return typeof id === 'string' && PROVIDERS.some((p) => p.id === id);
}

export function providerById(id: string | undefined): Provider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}
