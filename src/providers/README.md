# Providers — Developer Guide

> How the provider system works, how to add/remove providers, and how the
> internals are wired. Read `providers/registry.ts` and `providers/_shared/`
> alongside this guide.

## How a provider is registered

A provider is **live in the app only when it exists in two places**:

1. **`providers/urls.ts`** — the typed configuration source of truth. Holds
   the provider `id`, display `name`, and base `url`. Also defines **order**:
   the registry iterates `providerUrls` in order, so providers appear everywhere
   (home rail, settings, API) in that order.

2. **`providers/registry.ts`** — the code-behind map. Imports each provider
   module and maps its id to the `ProviderModule` implementation.

```ts
// providers/urls.ts  (config)
export const providerUrls = {
  myProvider: {
    name: 'My Provider',
    url: 'https://example.com',
    upstreamHosts: ['*.cdn.example.com'],   // hosts /api/stream may fetch
  },
  ...
} satisfies ProviderUrls;

// providers/registry.ts  (code)
import { myProvider } from './myProvider';
const providerModules = {
  myProvider,           // ← add here
  ...
};
```

Because `providerUrls` drives registration, disabling a provider is a one-line
change (delete its entry) and enabling is adding an entry back.

## Directory layout

```
providers/
├── _shared/                ← shared infrastructure (see below) — do NOT put per-provider logic here
├── <provider>/             ← one folder per provider
│   ├── index.ts            ← the ProviderModule object (identity + wiring)
│   ├── posts.ts            ← getSearchPosts (provider search)
│   ├── meta.ts             ← getMeta (title detail + episode/direct links)
│   ├── stream.ts           ← getStream (resolve playable streams)
│   ├── episodes.ts         ← getEpisodes (optional — series only)
│   ├── headers.ts          ← site/cloud request headers (optional)
├── registry.ts             ← wires urls.ts → modules
├── streamHeaders.ts        ← server-side playback identity per provider id
└── urls.ts                 ← provider config (name, url, upstreamHosts)
```

The files above are **the contract**. A provider may omit optional
capabilities (`getEpisodes`, `headers.ts`) entirely or implement only the pieces
it needs.

`upstreamHosts` is not optional in practice: a host missing from it is rejected
by `/api/stream` with 403. `pnpm test:providers` prints any host a live search
returns that is not listed yet.

## The shared module (`_shared/`)

Providers import everything shared from `../_shared`:

```ts
// runtime / values
import { providerBaseUrl, providerName } from '../_shared';
import { commonHeaders } from '../_shared';
import { throwProviderError } from '../_shared';

// types
import type {
  ProviderModule, RawPost, RawStream,
  RawInfo, RawLink, RawEpisodeLink, SettingsField, ...
} from '../_shared';
```

| File         | Exports                                                          | Purpose                                       |
|--------------|------------------------------------------------------------------|-----------------------------------------------|
| `types.ts`   | `ProviderModule`, zod-inferred `Raw*` types (`z.input` of `validations/provider` schemas), settings | The shared type contract |
| `urls.ts`    | `providerBaseUrl(id)`, `providerName(id)`, `providerAllowsHost(id, host)` | Typed config, base URL, playback host allowlist |
| `headers.ts` | `commonHeaders`, `USER_AGENT`                                     | Default browser-like request headers           |
| `errors.ts`  | `throwProviderError(provider, operation, error)`                 | Consistent error tagging                       |

> **URLs are local at runtime.** `providerBaseUrl(id)` reads the typed
> `providers/urls.ts` synchronously — no async `getBaseUrl()`, no network, no
> cache. `urls.ts` is the one and only source of truth for provider endpoints;
> when a site moves to a new domain, edit that entry and nothing else.
>
> **Retiring a provider.** There is no "temporarily down" flag — a provider that
> is failing stays configured and `pnpm test:providers` reports it, because the
> usual cause (a moved domain, a WAF wanting a cookie) is fixable and worth
> seeing. A provider that is gone for good should be **removed entirely** —
> delete the `urls.ts` entry and the `registry.ts` import, then drop the
> provider folder.

## The ProviderModule contract

Every provider folder's `index.ts` exports one object conforming to
`ProviderModule` (see `providers/_shared/types.ts`):

```ts
export interface ProviderModule {
  id: string;                 // must match the urls.ts key
  name: string;               // display name (use providerName('id'))

  getSearchPosts?({ query, page, signal? }): Promise<RawPost[]>;
  getMeta({ link, signal? }): Promise<RawInfo>;
  getEpisodes?({ url, signal? }): Promise<RawEpisodeLink[]>;   // optional
  getStream({ link, type, signal? }): Promise<RawStream[]>;
}
```

**Key convention:** the implementation methods take plain args (`{ query,
page, signal? }` and the like) — there is no `ctx` parameter.
Implementation functions return `Promise<RawPost[]>`, `Promise<RawInfo>`, etc.
(the `Raw*` shapes, `z.input` of the `validations/provider` schemas) and are
wired directly:

```ts
// index.ts — the whole provider definition is just wiring
export const myProvider: ProviderModule = {
  id: 'myProvider',
  name: providerName('myProvider'),   // ← from urls.ts
  getSearchPosts,  // ← imported directly from ./posts
  getMeta,         // ← from ./meta
  getStream,       // ← from ./stream
  // getEpisodes,  // ← optional, ./episodes
};
```

### `Raw*` types (zod-inferred)

`RawPost`, `RawInfo`, `RawStream`, `RawEpisodeLink` are `z.input` of the
schemas in `validations/provider.ts` (see `providers/_shared/types.ts`) —
not hand-written interfaces. Validate at the boundary with those schemas.

Provider modules call `fetch` directly and pass `signal` through. There is no
HTTP client wrapper — if a provider needs headers of its own, put them in
`utils.ts` next to `BASE_URL`.

## Step-by-step: adding a new provider

1. **Scaffold the folder** — create `providers/<myProvider>/` with the files
   you need (`index.ts` at minimum).

2. **Implement the contract** — start from a sibling provider folder and adapt
   the parsers, or use the template below. Write the parsers yourself: do not
   copy code from an unlicensed provider project.

3. **Wire it in `registry.ts`** — add the import and a `myProvider` entry to
   the `providerModules` map.

4. **Add config in `urls.ts`** — `{ myProvider: { name: '...', url: '...',
   upstreamHosts: [...] } }` on the `providerUrls` object, listing every host a
   playable link can come from.

5. **Add playback identity** in `providers/streamHeaders.ts` if the CDN needs a
   `Referer`, `Origin` or any other header to hand over the file. Never put
   credentials in `RawStream.headers` — that output reaches the browser.

6. **Validate**:
   ```bash
   pnpm typecheck          # tsc --noEmit
   pnpm lint               # biome check
   pnpm test               # vitest run (mocked)
   pnpm test:providers     # RUN_LIVE=1 over tests/live (network)
   ```
   The live run also fails if a playback host is missing from `upstreamHosts`,
   and prints what to add.

### Minimal template

```ts
// providers/myProvider/posts.ts
import type { RawPost } from '../_shared';
import { throwProviderError } from '../_shared';
import { BASE_URL, requestHeaders } from './utils';

export async function getSearchPosts({
  query, page, signal,
}: {
  query: string; page: number; signal?: AbortSignal;
}): Promise<RawPost[]> {
  try {
    const response = await fetch(
      new URL(`/search?keyword=${encodeURIComponent(query)}`, `${BASE_URL}/`).toString(),
      { headers: await requestHeaders(), signal },
    );
    if (!response.ok) throw new Error(`MyProvider returned ${response.status}`);
    return ((await response.json())?.results ?? []) as RawPost[];
  } catch (err) {
    throwProviderError('MyProvider', 'search', err);
  }
}
```

```ts
// providers/myProvider/index.ts
import type { ProviderModule } from '../_shared';
import { providerName } from '../_shared';
import { getSearchPosts } from './posts';
import { getMeta } from './meta';
import { getStream } from './stream';

export const myProvider: ProviderModule = {
  id: 'myProvider',
  name: providerName('myProvider'),
  getSearchPosts,
  getMeta,
  getStream,
};
```

## Step-by-step: removing / disabling a provider

- **Disable (keep code, drop from app):** delete the `urls.ts` entry.
- **Fully remove:** delete the `urls.ts` entry **and** remove the import +
  map entry in `registry.ts`, then delete the provider folder.

## Updating a provider's base URL

Edit the provider's entry in `providers/urls.ts` — no code change needed
elsewhere. The change is picked up on the next reload/rebuild because
`providerBaseUrl()` reads the typed config directly.

## Guidelines

- **Base URL:** always read via `providerBaseUrl('yourId')` at module top-level
  and store as `const BASE_URL`. Never hardcode a URL twice.
- **Errors:** use `throwProviderError('YourProvider', 'operation', err)` in
  catch blocks. Return empty arrays for "nothing found" instead of throwing.
- **Raw vs normalized types:** provider code returns `Raw*` shapes; consumers
  (`services/`) normalize them later. Do not import app-side normalized
  types into providers.
- **No console logging in provider logic** (`biome` `noConsole: warn`).
- **Keep providers independent:** no cross-provider imports. Shared logic
  belongs in `_shared/`, never in another provider's folder.

## Common pitfalls

- `index.ts` uses a `name` that doesn't match `urls.ts` → `providerName(id)` throws.
- Forgetting to add a `urls.ts` entry → provider never registers (silently absent from `listProviders()`).
- Implementing `getSearchPosts` with `searchQuery` instead of `query` → type error; the contract is `query`.
- `kind` must be one of `'movies' | 'anime' | 'india' | 'english' | 'global'`.