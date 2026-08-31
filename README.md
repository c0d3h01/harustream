<div align="center">

# Harustream

**Self-hosted anime, movie & web series streaming app built with Next.js**

[![Next.js](https://img.shields.io/badge/Next.js%2016-000000?style=flat-square&logo=next.js&logoColor=white)](https://nextjs.org)
[![React](https://img.shields.io/badge/React%2019-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript%205.7-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS%204-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![License](https://img.shields.io/badge/License-AGPL--3.0-blue?style=flat-square)](./LICENSE)

[Live demo](https://harustream.vercel.app) · [Report an issue](../../issues)

</div>

---

Harustream is an open-source streaming web app for anime, movies, and web series. It ships **no content source of its own**: everything is resolved through pluggable **providers** — one folder per source, wired into the app in two typed files. Providers are built-in modules (anikoto, Torrentio, MovieBox Web, Vega) defined in one config file; swap/extend that config and the entire catalog follows with no other code changes.

## ✨ Features

- 🔌 **Plugin-based providers** — content sources are one folder per provider under `src/providers/`, registered in `src/providers/registry.ts` and configured in `src/providers/urls.ts` (the single source of truth for names & base URLs). Disable a provider by deleting its `urls.ts` entry.
- 🔍 **Multi-provider search & feeds** — search and featured endpoints fan out across every available provider concurrently with per-fan-out deadlines.
- 🎬 **Immersive player** — Vidstack-powered fullscreen playback with in-video audio, quality selection, subtitles, and an HLS/DASH-aware stream proxy.
- 🖼️ **Optimized artwork pipeline** — every poster/backdrop flows through an SSRF-guarded image proxy into `next/image`, served as AVIF/WebP with long-lived CDN caching.
- 🔀 **Web streaming proxy** — server-side media proxy (optional Cloudflare Worker front + built-in `/api/proxy`) that injects provider-required headers, rewrites HLS manifests so every segment loops back through it, passes `Range` through for seeking, and rejects private hosts.
- ⚡ **Performance-tuned** — in-process caching with single-flight loading, CDN cache headers on API routes, and barrel-import optimization.
- 📊 **Structured logging** — pino-based request logging with request-id stamping middleware.
- 🧪 **Quality gates** — Biome lint/format, `tsc --noEmit` type checking, and Vitest test suite.

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) ≥ 20
- [pnpm](https://pnpm.io) (`corepack enable`)

### Setup

```bash
git clone https://github.com/harusharu/harustream.git
cd harustream
pnpm install

# configure environment (all optional — defaults work out of the box)
cp .env.example .env.local

pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## ⚙️ Configuration

All configuration happens through environment variables — see [.env.example](.env.example) for the full annotated list.

| Variable | Required | Default | Description |
|---|---|---|---|
| `PROVIDER_CONCURRENCY` | — | `6` | Max concurrent provider executions during fan-out |
| `PROVIDER_DEADLINE_MS` | — | `12000` | Overall fan-out deadline |
| `PROVIDER_TIMEOUT_MS` | — | `10000` | Per-provider execution timeout |
| `LOG_LEVEL` | — | `info` (prod) | pino log level (`fatal`…`trace`) |
| `STREAM_PROXY_USER_AGENT` | — | — | UA presented to provider hosts by the stream proxy |
| `STREAM_PROXY_ALLOW_PRIVATE` | — | off | Allow private/internal upstream hosts (**dev only**) |
| `STREAM_PROXY_SECRET` | — | — | HMAC signing key for `/api/proxy` passthrough (needed in prod) |
| `STREAM_PROXY_TOKEN_TTL_MS` | — | `43200000` | Signed URL lifetime |
| `NEXT_PUBLIC_STREAM_PROXY_URL` | — | — | Cloudflare Worker (`src/proxy/`) fronting media streams; falls back to `/api/proxy` |
| `NEXT_PUBLIC_PROVIDER_API_URL` | — | — | Absolute origin of a deployed app (used for client-side preconnect) |
| `NEXT_PUBLIC_IMAGE_ORIGINS` | — | — | Comma-separated poster origins for `<link rel="preconnect">` |

## 🏗️ Architecture

A single Next.js (App Router) application with a strict layering:

```
src/
├── app/           # routes + API glue only — thin HTTP over services/
├── components/    # UI grouped by feature (home, layout, library, playback,
│                  # search, settings, title, ui)
├── providers/     # the plugin engine: registry, per-provider TTL cache
│                  # w/ single-flight, _shared/ infra
├── services/      # domain layer: catalog, search, fanout, featured,
│                  # sources, normalize, media, episodes
├── validations/   # Zod schemas for parsing untrusted provider output
├── types/         # normalized app-facing types (Post, Media, Stream, ...)
├── mcp/           # repo-local Model Context Protocol server
├── proxy.ts       # locale-routing + API logging middleware
└── lib/           # client fetchers, cache, hooks, state, logging, i18n
```

The core split: **`providers/` executes untrusted provider code and returns `Raw*` shapes**, **`services/` decides what to fetch, validates input, and normalizes raw output** into the app-facing `types`. `src/providers/README.md` is the authoritative source on adding/removing/maintaining providers.

### Providers

Built-in providers live in `src/providers/` — one folder per provider, wired
through `src/providers/registry.ts` and configured in `src/providers/urls.ts`
(single source of truth for provider names & base URLs; no remote fetching).
See **[`src/providers/README.md`](src/providers/README.md)** — the
developer guide for adding, removing, and maintaining providers.

## 🧰 Scripts

Everyday commands live in `package.json`. The names are grouped by domain:

| Command                 | What it does |
|-------------------------|--------------|
| `pnpm dev`              | Start the Next.js dev server (hot reload) |
| `pnpm build`            | Production build |
| `pnpm start`            | Run the production build |
| `pnpm lint`             | Biome check — style + correctness |
| `pnpm lint:fix`         | Biome check with auto-fix |
| `pnpm format`           | Biome format (rewrites files) |
| `pnpm typecheck`        | `tsc --noEmit` — strict type check |
| `pnpm test`             | Fast, mocked unit tests (no network) |
| `pnpm test:watch`       | Unit tests in watch mode |
| `pnpm test:providers`   | Live smoke tests against real provider sites (needs network, opt-in). Automatically refreshes provider URLs first |
| `pnpm providers:update-urls` | Probe every provider (retired ones are skipped), follow redirects/mirrors, and update `urls.ts` when a domain moved. Flags: `--dry-run`, `--check`, `--json` |
| `pnpm mcp:serve`        | Run the MCP server once |
| `pnpm mcp:watch`        | Run the MCP server, auto-restart on file changes |

## 🤝 Contributing

Issues and pull requests are welcome. Before opening a PR, run:

```bash
pnpm lint && pnpm typecheck && pnpm test
```

See the `# Architecture` section above and [`src/providers/README.md`](src/providers/README.md) to learn where new code belongs.

## 📄 License

Distributed under the [GNU AGPL-3.0](./LICENSE).

## ⚠️ Disclaimer

Harustream is a **self-hosted front-end and provider-runtime engine**. It hosts, stores, uploads, or serves no media itself — all content is resolved from third-party provider modules configured entirely by whoever deploys it. This project exists for educational purposes; users are responsible for complying with the laws of their jurisdiction and the terms of any provider they connect.
