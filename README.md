# Harustream

A self-hosted streaming web app for anime, movies and web series. Nothing is
hosted here: every title, episode and stream URL is resolved at request time
through **providers** — content sources you configure yourself.

## What it does

- **TMDB catalogue** — trending, popular and top-rated rails, detail pages, trailers, cast.
- **Multi-provider search** — one query goes to every configured provider at once; results come back grouped by source, best match first.
- **Source chooser** — a TMDB title lists every release every provider has, grouped by provider, so you pick the exact one.
- **Player** — HLS, DASH and progressive playback with quality switching, subtitles, and resume.
- **Library and progress** — device-local, keyed by `provider:ref`; nothing personal is sent to a server.

## How it works

Pages are React Server Components that call services directly — there is no JSON
API layer. Two HTTP routes exist because a browser cannot do the work itself:

- `/api/stream/...` — playback pass-through. Provider CDNs need server-side
  identity headers and send no CORS headers, and HLS/DASH children have to be
  rewritten back through the route. It is stateless and allowlisted: each
  provider declares its playback hosts, redirects are followed by hand with the
  same check on every hop, and credentials are dropped when a hop leaves the
  provider's origin.
- `/api/image/...` — artwork proxy, SSRF-guarded on every hop.

Full map: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Provider guide:
[`providers/README.md`](providers/README.md).

## Getting started

Requires Node >= 20 and pnpm (never npm/yarn).

```sh
pnpm install
cp .env.example .env.local   # then fill in TMDB_API_KEY
pnpm dev
```

`TMDB_API_KEY` powers the catalogue; without it the app still searches providers,
it just shows a configuration notice instead of TMDB content. Providers that need
a WAF clearance cookie take it in their own env var (see `.env.example`).

## Quality gates

```sh
pnpm lint        # biome check .
pnpm typecheck   # tsc --noEmit
pnpm test        # sequential audit over every test group, with a summary table
```

`pnpm test:providers` runs the opt-in network suites: provider smoke tests plus a
playback-host allowlist check.

## Deploying to Vercel

Deployment is Vercel's git integration: push to the connected branch and
Vercel builds (`pnpm build`) and ships. No extra runtime config or bindings
are needed.

Set the environment variables in the Vercel project settings. `TMDB_API_KEY`
is a server-only variable (no `NEXT_PUBLIC_` prefix) — never expose it to the
browser, and never commit it.

## Disclaimer

> [!WARNING]
> Harustream is a **self-hosted front-end and provider-runtime engine**. It
> hosts, stores, uploads or serves no media itself. All content is resolved from
> third-party provider modules configured entirely by whoever deploys it, and the
> project exists for educational purposes. Users are responsible for complying
> with the laws of their jurisdiction and the terms of any provider they
> connect.
