# Providers — Developer Guide

> How the provider system works, how to add/remove providers, and how the
> internals are wired. Read `src/providers/registry.ts` and `src/providers/_shared/`
> alongside this guide.

## How a provider is registered

A provider is **live in the app only when it exists in two places**:

1. **`src/providers/urls.ts`** — the typed configuration source of truth. Holds
   the provider `id`, display `name`, and base `url`. Also defines **order**:
   the registry iterates `providerUrls` in order, so providers appear everywhere
   (home rail, settings, API) in that order.

2. **`src/providers/registry.ts`** — the code-behind map. Imports each provider
   module and maps its id to the `ProviderModule` implementation.

```ts
// src/providers/urls.ts  (config)
export const providerUrls = {
  myProvider: { name: 'My Provider', url: 'https://example.com' },
  ...
} satisfies ProviderUrls;

// src/providers/registry.ts  (code)
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
├── registry.ts             ← wires urls.ts → modules
└── urls.ts                 ← provider config (name + url)
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
| `urls.ts`    | `providerBaseUrl(id)`, `providerName(id)`, `providerManifest`    | Typed provider config + synchronous helpers  |
| `context.ts` | `createProviderContext(id)`, `openWebView`, `commonHeaders`      | Builds per-provider axios/cheerio/kv context  |
| `headers.ts` | `commonHeaders`                                                  | Default browser-like request headers           |
| `errors.ts`  | `throwProviderError(provider, operation, error)`                 | Consistent error tagging                       |

> **URLs are local at runtime, refreshed by a script.** `providerBaseUrl(id)`
> reads the typed `src/providers/urls.ts` synchronously — no async
> `getBaseUrl()`, no network, no cache. `urls.ts` is the one and only source of
> truth for provider endpoints.
>
> **`pnpm providers:update-urls`** probes every provider (HTTP 2xx + its brand
> marker must appear in the page) and, when a domain has moved, follows
> redirects and a per-provider mirror table (`scripts/update-provider-urls.ts`
> → `MIRRORS`) — it only adopts a candidate that validates, never a raw guess.
> It rewrites `src/providers/urls.ts` in place, so the change stays typed and
> reviewable. Run it after a provider dies or before release; it also auto-runs
> ahead of `pnpm test:providers`. If a site moved to a new domain, add the known
> mirror to `MIRRORS` (evidence-backed, e.g. announced on the provider's own
> page) and re-run.
>
> **Automated refresh.** The **Update Provider URLs** workflow (`.github/workflows/
> update-provider-urls.yml`, manual `workflow_dispatch` trigger) runs the updater
> in CI and opens a pull request against the default branch when a URL changed —
> no changes, no PR.
>
> **Retiring a provider.** When a provider may come back (temporary outage,
> domain rotation) set `retired: true` (+ a `retiredNote`) on its `urls.ts`
> entry: it is kept in the config but never probed by the updater and skipped by
> the live suite, so nothing emits false alarms. Providers that are gone for good
> should be **removed entirely** — delete the `urls.ts` entry and the `registry.ts`
> import, then drop the provider folder. (hiAnime and flixhq were removed this
> way after hiAnime shut down and flixhq's origin went dark.)

## The ProviderModule contract

Every provider folder's `index.ts` exports one object conforming to
`ProviderModule` (see `src/providers/_shared/types.ts`):

```ts
export interface ProviderModule {
  id: string;                 // must match the urls.ts key
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
  name: providerName('myProvider'),   // ← from urls.ts
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
   (e.g. copy `movieBoxWeb/` and adapt the parsers) or the template below.

3. **Wire it in `registry.ts`** — add the import and a `myProvider` entry to
   the `providerModules` map.

4. **Add config in `urls.ts`** — `{ myProvider: { name: '...', url: '...' } }`
   on the `providerUrls` object.

5. **Validate**:
   ```bash
   pnpm typecheck          # tsc --noEmit
   pnpm lint               # biome check
   pnpm test               # vitest (mocked)
   ```
   For live smoke tests against the real site, run `pnpm test:providers`
   (opt-in network suite, see `tests/live/providers.test.ts`). After a domain
   move, run `pnpm providers:update-urls` first so tests hit the live URL
   (it also runs automatically before `pnpm test:providers`).

### Minimal template

```ts
// src/providers/myProvider/posts.ts
import type { RawPost, ProviderContext } from '../_shared';
import { providerBaseUrl, throwProviderError } from '../_shared';

const BASE_URL = providerBaseUrl('myProvider');   // synchronous, from urls.ts

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

- **Disable (keep code, drop from app):** delete the `urls.ts` entry.
- **Fully remove:** delete the `urls.ts` entry **and** remove the import +
  map entry in `registry.ts`, then delete the provider folder.
- Remember to remove any keys it used from user settings / `kvStore` if they
  no longer apply.

## Updating a provider's base URL

Edit the provider's entry in `src/providers/urls.ts` — no code change needed
elsewhere. The change is picked up on the next reload/rebuild because
`providerBaseUrl()` reads the typed config directly. For proactive refreshes,
run `pnpm providers:update-urls` (or trigger the **Update Provider URLs**
GitHub Actions workflow, which audits every site and opens a PR on a move).

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

- `index.ts` uses a `name` that doesn't match `urls.ts` → `providerName(id)` throws.
- Forgetting to add a `urls.ts` entry → provider never registers (silently absent from `listProviders()`).
- Implementing `getSearchPosts` with `searchQuery` instead of `query` → type error; the contract is `query`.
- `kind` must be one of `'movies' | 'anime' | 'india' | 'english' | 'global'`.