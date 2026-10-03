# Architecture

HaruStream is a self-hosted streaming front-end. No media is hosted, stored or
served: everything resolves through pluggable provider modules at runtime.

## Shape of the app

There is no JSON API layer. Pages are Server Components that call services
directly, so a page render is one hop from React to the provider:

```
page (RSC) → service (fan-out, cache) → provider module → normalize → props
```

Two route handlers exist, and only because a browser cannot do the work itself:

| Route | Why it has to be a route |
| --- | --- |
| `/api/stream/[...stream]` | Provider CDNs need server-side identity headers and do not send CORS headers. Also the only place that can rewrite HLS/DASH children back through itself. |
| `/api/image/[...encoded]` | Provider artwork is referer-protected, and the image proxy owns the SSRF guard. `next/image` optimization is off. |

## Playback

1. `/watch/[provider]/[ref]` (RSC) resolves media → episodes → variants with
   `services/media.ts`, `services/episodes.ts`, `services/sources.ts`.
2. Each `StreamVariant` gets a `playbackHref` of
   `/api/stream/<provider>/<base64url target>`.
3. `hls.js` / `dash.js` / native playback fetch manifests, segments and
   subtitles through that route.
4. The route re-adds the provider's identity (`providers/streamHeaders.ts`),
   forwards `Range`, streams the body, converts SRT/TTML to WebVTT, and
   rewrites manifest children (`lib/streaming/manifestRewriter.ts`) so every
   subsequent request comes back through the route.

The route is stateless: no tokens, no signing, no per-target cache keys. What
makes it safe is the allowlist — `providers/urls.ts` lists the playback hosts
per provider (`upstreamHosts`, matched by `providers/_shared/urls.ts`), and every
hop of every redirect is re-checked against it, with credentials stripped when a
hop leaves the provider's origin.

## Providers

**Registration is dual** — a provider is live only if it appears in both:

- `providers/urls.ts` — base URL, name, order, `upstreamHosts` (source of truth)
- `providers/registry.ts` — maps ids to modules

**Contract** (`providers/_shared/types.ts`): every method takes `ctx` and returns
`Raw*` shapes; `services/normalize.ts` turns those into `SearchResult`, `Media`,
`Episode`. Providers never import each other and never import app types.

Full provider guide: `providers/README.md`.

## Directory map

```
app/
  page.tsx                  Home (TMDB rails)
  search/                   Search: every provider's own results, grouped
  find/[kind]/[id]/         Source chooser for a TMDB id (server-resolved)
  movie/[id]/ tv/[id]/      TMDB detail pages
  title/[provider]/[ref]/   Provider title page
  watch/[provider]/[ref]/   Player page
  library/ settings/        Device-local views
  api/stream/ api/image/    The only two route handlers
components/
  layout/ home/ library/ search/ settings/ title/ tmdb/ player/ transitions/ ui/
lib/
  base64url.ts media.ts routes.ts utils.ts env.ts cache.ts errors.ts log.ts
  net/ssrf.ts               Host blocking (SSRF guard)
  storage/                  localStorage hooks + Zod schemas
  streaming/                upstream.ts, streamUrl.ts, manifestRewriter.ts,
                            subtitles.ts, types.ts
providers/
  urls.ts labels.ts registry.ts streamHeaders.ts _shared/ movieBoxWeb/
services/
  search media episodes sources resolve   entry points per page
  fanout provider normalize               machinery behind them
tmdb/                       Server-only TMDB client (never reaches the client)
validations/                provider.ts (Raw* shapes), tmdb.ts
types/media.ts              Domain types
tests/                      Vitest; tests/live/ is opt-in network
```

## Deployment

Deployment is Vercel via git integration. Locally the standard commands are
`pnpm build` / `pnpm start`.

```
Browser → Next.js (Vercel) → src/app/api/[[...route]]/route.ts → Hono app → page/service → provider
```

`src/app/api/[[...route]]/route.ts` is a single Next catch-all route that
delegates to one Hono app (`src/server/app.ts`, `basePath('/api')`), which
composes the routers in `src/server/routers/` (`health`, `tmdb`, `resolve`,
`media`, `image`, `stream`). In-memory TTL caches live in the server instance.

Secrets: `TMDB_API_KEY` and a provider's own session env var (when needed) are
server-only environment variables set in the Vercel project settings — never
`NEXT_PUBLIC_`, never committed. Providers are still reached from server code
only; `/api/stream` and `/api/image` remain the only browser-facing proxy
paths, both SSRF-guarded with a per-hop host re-check.

## Design decisions

1. **No media hosting** — everything resolves through providers at runtime.
2. **No JSON API layer** — pages read services directly; only playback and
   images need HTTP routes.
3. **Stateless allowlisted proxy** — no tokens, no signing, no open `?url=`.
4. **Server-side TMDB** — the API key never reaches the client.
5. **Fan-out with deadlines** — bounded concurrency, hard per-provider timeouts.
6. **Dual provider registration** — `urls.ts` *and* `registry.ts`.
7. **Device-local library and progress** — one global store keyed by
   `provider:ref`; nothing personal leaves the browser.
