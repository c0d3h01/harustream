<div align="center">

# Harustream

**Self-hosted anime, movie & web series streaming app built with Next.js**

[![Next.js](https://img.shields.io/badge/Next.js%2016-000000?style=flat-square&logo=next.js&logoColor=white)](https://nextjs.org)
[![React](https://img.shields.io/badge/React%2019-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript%205.7-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS%204-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![License](https://img.shields.io/badge/License-AGPL--3.0-blue?style=flat-square)](./LICENSE)

[Live demo](https://harustream.vercel.app) · [Architecture](docs/ARCHITECTURE.md) · [Report an issue](../../issues)

</div>

---

Harustream is an open-source streaming web app for anime, movies, and web series. It ships **no content source of its own**: a live provider manifest drives everything, and each provider is an untrusted module fetched at runtime and executed inside a hardened `node:vm` sandbox. Swap the manifest URL and the entire catalog follows — no code changes, nothing hardcoded.

## ✨ Features

- 🔌 **Plugin-based providers** — content sources are external modules discovered through a live manifest (`urls.json` + `manifest.json`). Fork it, point `PROVIDER_MANIFEST_URL` at your own, and you have your own branded streamer.
- 🛡️ **Sandboxed runtime** — provider modules run isolated in a `node:vm` sandbox with timeouts, retry limits, bounded concurrency, and typed `ProviderError` propagation.
- 🔍 **Multi-provider search & feeds** — search and featured endpoints fan out across every available provider concurrently with per-fan-out deadlines.
- 🎬 **Immersive player** — Vidstack-powered fullscreen playback with in-video audio, quality selection, and subtitle support.
- 🖼️ **Optimized artwork pipeline** — every poster/backdrop flows through an SSRF-guarded image proxy into `next/image`, served as AVIF/WebP with long-lived CDN caching.
- ⚡ **Performance-tuned** — in-process caching with single-flight loading, CDN cache headers on API routes, barrel-import optimization, and touch-device-friendly rendering budgets.
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

# configure environment
cp .env.example .env.local
# edit .env.local → PROVIDER_MANIFEST_URL is required

pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## ⚙️ Configuration

All configuration happens through environment variables — see [.env.example](.env.example) for the full annotated list.

| Variable | Required | Default | Description |
|---|---|---|---|
| `PROVIDER_MANIFEST_URL` | ✅ | — | URL of the live provider manifest (`urls.json`) listing every channel |
| `NEXT_PUBLIC_PROVIDER_API_URL` | — | — | Absolute origin of a deployed provider API (used for client-side preconnect) |
| `PROVIDER_TIMEOUT_MS` | — | `20000` | Provider module execution timeout |
| `PROVIDER_MAX_ATTEMPTS` | — | `2` | Manifest/module fetch retries |
| `PROVIDER_CONCURRENCY` | — | `6` | Max concurrent provider executions during fan-out |
| `PROVIDER_DEADLINE_MS` | — | `12000` | Overall fan-out deadline |
| `LOG_LEVEL` | — | `info` (prod) | pino log level (`fatal`…`trace`) |
| `STREAM_PROXY_USER_AGENT` | — | — | UA presented to provider hosts by the stream proxy |
| `NEXT_PUBLIC_STREAM_PROXY_URL` | — | — | Cloudflare Worker (`src/proxy/`) fronting media streams; falls back to `/api/proxy` |
| `STREAM_PROXY_ALLOW_PRIVATE` | — | off | Allow private/internal upstream hosts (**dev only**) |
| `NEXT_PUBLIC_IMAGE_ORIGINS` | — | — | Comma-separated poster origins for `<link rel="preconnect">` |

## 🏗️ Architecture

A single Next.js (App Router) application with a strict layering:

```
src/
├── app/         # routes only — thin HTTP glue over media/ and providers/
├── components/  # UI grouped by feature (home, library, player, search, settings)
├── providers/   # the plugin engine: registry, node:vm sandbox,
│                # TTL cache w/ single-flight, concurrent fan-out
├── media/       # domain logic: catalog, search, streams, episodes
└── lib/         # client fetchers, hooks, state, logging
```

The core split: **`providers/` executes untrusted provider code**, **`media/` decides what to fetch and shapes the API contract**. Read the full write-up in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## 🧰 Scripts

```bash
pnpm dev          # start dev server
pnpm build        # production build
pnpm lint         # biome check
pnpm format       # biome format
pnpm typecheck    # tsc --noEmit
pnpm test         # vitest
```

## 🤝 Contributing

Issues and pull requests are welcome. Before opening a PR, run:

```bash
pnpm lint && pnpm typecheck && pnpm test
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) to learn where new code belongs.

## 📄 License

Distributed under the [GNU AGPL-3.0](./LICENSE).

## ⚠️ Disclaimer

Harustream is a **self-hosted front-end and provider-runtime engine**. It hosts, stores, uploads, or serves no media itself — all content is resolved from third-party provider modules configured entirely by whoever deploys it. This project exists for educational purposes; users are responsible for complying with the laws of their jurisdiction and the terms of any provider they connect.
