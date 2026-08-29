# Providers — Developer Guide

> How the provider system works, how to add/remove providers, and how the
> internals are wired. Read `src/providers/registry.ts` and `src/providers/_shared/`
> alongside this guide.

## How a provider is registered

A provider is **live in the app only when it exists in two places**:

1. **`src/providers/urls.json`** — the configuration source of truth. Holds the
   provider `id`, display `name`, and base `url`. Also defines **order**: the
   registry iterates `urls.json` in order, so providers appear everywhere
   (home rail, settings, API) in that order.

2. **`src/providers/registry.ts`** — the code-behind map. Imports each provider
   module and maps its id to the `ProviderModule` implementation.

```ts
// src/providers/urls.json  (config)
{
  "myProvider": { "name": "My Provider", "url": "https://example.com" }
}

// src/providers/registry.ts  (code)
import { myProvider } from './myProvider';
const providerModules = {
  myProvider,           // ← add here
  ...
};
```

Because `urls.json` drives registration, disabling a provider is a one-line
change (delete its entry) and enabling is adding an entry back.

## Directory layout

```
src/providers/
├── _shared/                ← shared infrastructure (see below) — do NOT put per-provider logic here
├── <provider>/             ← one folder per provider
│   ├── index.ts            ← the ProviderModule object (identity + wiring)
│   ├── catalog.ts          ← catalog filters + genre lists
│   ├── posts.ts            ← getPosts / getSearchPosts (browse + search)
│   ├── meta.ts             ← getMeta (title detail + episode/direct links)
│   ├── stream.ts           ← getStream (resolve playable streams)
│   ├── episodes.ts         ← getEpisodes (optional — series only)
│   └── settings.ts         ← getSettingsSchema (optional)
├── registry.ts             ← wires urls.json → modules
└── urls.json               ← provider config (name + url)
```

The five files above are **the contract**. A provider may omit optional
capabilities (`getEpisodes`, `getSettingsSchema`) entirely or implement only
the pieces it needs.

## The shared module (`_shared/`)

Providers import everything shared from `../_shared`:

```ts
// runtime / values
import { providerBaseUrl, providerName, providerManifest } from '../_shared';
import { createProviderContext, openWebView, commonHeaders } from '../_shared';
import { throwProviderError } from '../_shared';

// types
import type {
  ProviderModule, ProviderContext, RawPost, RawStream,
  RawInfo, RawLink, RawEpisodeLink, SettingsField, ...
} from '../_shared';
```

| File         | Exports                                                          | Purpose                                       |
|--------------|------------------------------------------------------------------|-----------------------------------------------|
| `types.ts`   | `ProviderModule`, `ProviderContext`, all `Raw*` types, settings  | The shared type contract                       |
| `urls.ts`    | `providerBaseUrl(id)`, `providerName(id)`, `providerManifest`    | Reads `urls.json` **synchronously**           |
| `context.ts` | `createProviderContext(id)`, `openWebView`, `commonHeaders`      | Builds per-provider axios/cheerio/kv context  |
| `headers.ts` | `commonHeaders`                                                  | Default browser-like request headers           |
| `errors.ts`  | `throwProviderError(provider, operation, error)`                 | Consistent error tagging                       |

> **No remote URL fetching.** Provider base URLs come from `urls.json` via the
> synchronous `providerBaseUrl(id)` helper. There is no async `getBaseUrl()`,
> no GitHub-fetched config, and no caching layer for URLs. Set the URL in
> `urls.json` and it takes effect immediately.

## The ProviderModule contract

Every provider folder's `index.ts` exports one object conforming to
`ProviderModule` (see `src/providers/_shared/types.ts`):

```ts
export interface ProviderModule {
  id: string;                 // must match the urls.json key
  name: string;               // display name (use providerName('id'))
  kind: 'movies' | 'anime' | 'india' | 'english' | 'global';
  catalog: Catalog[];         // browse filters, e.g. "Popular", "Recently Added"
  genres: Catalog[];          // genre filters
  searchFilter?: string;      // optional
  nonStreamableServer?: string[];

  getPosts({ filter, page, signal?, ctx }): Promise<RawPost[]>;
  getSearchPosts({ query, page, signal?, ctx }): Promise<RawPost[]>;
  getMeta({ link, signal?, ctx }): Promise<RawInfo>;
  getEpisodes?({ url, signal?, ctx }): Promise<RawEpisodeLink[]>;   // optional
  getStream({ link, type, signal?, ctx }): Promise<RawStream[]>;
  getSettingsSchema?({ ctx }): Promise<SettingsField[]>;            // optional
}
```

**Key convention:** the implementation methods take `ctx` (the
`ProviderContext`) directly — there is no renaming between an internal
`providerContext` and the interface's `ctx`. Implementation functions return
`Promise<RawPost[]>`, `Promise<RawInfo>`, etc. (the raw shapes) and are wired
directly:

```ts
// index.ts — the whole provider definition is just wiring
export const myProvider: ProviderModule = {
  id: 'myProvider',
  name: providerName('myProvider'),   // ← from urls.json
  kind: 'global',
  catalog,
  genres,
  getPosts,        // ← imported directly from ./posts
  getSearchPosts,
  getMeta,         // ← from ./meta
  getStream,       // ← from ./stream
  // getEpisodes,  // ← optional, ./episodes
  // getSettingsSchema, // ← optional, ./settings
};
```

### `ProviderContext` (what `ctx` gives you)

```ts
interface ProviderContext {
  axios: AxiosInstance;                                   // preconfigured HTTP client
  cheerio: typeof cheerio;                                // HTML parsing
  commonHeaders: Record<string, string>;                  // browser-like defaults
  kvStore: ProviderKvStore;                               // per-provider key/value store (settings, cache)
  openWebView(url, options?): Promise<OpenWebViewResult>; // interactive challenges (not supported)
}
```

## Step-by-step: adding a new provider

1. **Scaffold the folder** — create `src/providers/<myProvider>/` with the files
   you need (`index.ts` at minimum).

2. **Implement the contract** — start from either a sibling provider folder
   (e.g. copy `flixhq/` and adapt the parsers) or the template below.

3. **Wire it in `registry.ts`** — add the import and a `myProvider` entry to
   the `providerModules` map.

4. **Add config in `urls.json`** — `{ "myProvider": { "name": "...", "url": "..." } }`.

5. **Validate**:
   ```bash
   pnpm typecheck          # tsc --noEmit
   pnpm lint               # biome check
   pnpm test               # vitest
   npx tsx src/scripts/test-provider.ts myProvider   # live smoke test
   ```

### Minimal template

```ts
// src/providers/myProvider/posts.ts
import type { RawPost, ProviderContext } from '../_shared';
import { providerBaseUrl, throwProviderError } from '../_shared';

const BASE_URL = providerBaseUrl('myProvider');   // synchronous, from urls.json

export async function getPosts({
  filter, page, signal, ctx,
}: {
  filter: string; page: number; signal?: AbortSignal; ctx: ProviderContext;
}): Promise<RawPost[]> {
  try {
    const res = await ctx.axios.get(`${BASE_URL}${filter}?page=${page}`, { signal });
    return (res.data?.results || []).map((r: any) => ({ title: r.title, link: r.id, image: r.image }));
  } catch (err) {
    throwProviderError('MyProvider', 'posts', err);
  }
}
```

```ts
// src/providers/myProvider/index.ts
import type { ProviderModule } from '../_shared';
import { providerName } from '../_shared';
import { catalog, genres } from './catalog';
import { getPosts, getSearchPosts } from './posts';
import { getMeta } from './meta';
import { getStream } from './stream';

export const myProvider: ProviderModule = {
  id: 'myProvider',
  name: providerName('myProvider'),
  kind: 'global',
  catalog,
  genres,
  getPosts,
  getSearchPosts,
  getMeta,
  getStream,
};
```

## Step-by-step: removing / disabling a provider

- **Disable (keep code, drop from app):** delete the `urls.json` entry.
- **Fully remove:** delete the `urls.json` entry **and** remove the import +
  map entry in `registry.ts`, then delete the provider folder.
- Remember to remove any keys it used from user settings / `kvStore` if they
  no longer apply.

## Updating a provider's base URL

Edit `src/providers/urls.json` only — no code change needed. The change is
picked up on the next reload/rebuild because `providerBaseUrl()` reads the
JSON directly.

## Guidelines

- **Base URL:** always read via `providerBaseUrl('yourId')` at module top-level
  and store as `const BASE_URL`. Never hardcode a URL twice.
- **Errors:** use `throwProviderError('YourProvider', 'operation', err)` in
  catch blocks. Return empty arrays for "nothing found" instead of throwing.
- **Settings keys:** prefix with the provider id, e.g. `myProvider_skipTimings`.
- **Raw vs normalized types:** provider code returns `Raw*` shapes; consumers
  (`src/services/`) normalize them later. Do not import app-side normalized
  types into providers.
- **No console logging in provider logic** (`biome` `noConsole: warn`).
- **Keep providers independent:** no cross-provider imports. Shared logic
  belongs in `_shared/`, never in another provider's folder.

## Common pitfalls

- `index.ts` uses a `name` that doesn't match `urls.json` → `providerName(id)` throws.
- Forgetting to add `urls.json` entry → provider never registers (silently absent from `listProviders()`).
- Implementing `getSearchPosts` with `searchQuery` instead of `query` → type error; the contract is `query`.
- `kind` must be one of `'movies' | 'anime' | 'india' | 'english' | 'global'`.