<div align="center">

# Harustream

**Self-hosted anime, movie & web series streaming app**

[Live demo](https://harustream.vercel.app) · [Report an issue](https://github.com/harusharu/harustream/issues)

</div>

---

Harustream is a self-hosted streaming web app for anime, movies, and web series. Everything is resolved through pluggable **providers** — content sources you configure yourself.

## Features

- **Plugin-based providers** — add or remove content sources by configuring provider modules
- **Multi-provider search & feeds** — search and featured content fan out across all configured providers
- **Immersive player** — Vidstack-powered playback with quality selection, subtitles, and HLS/DASH support
- **Optimized artwork** — posters and backdrops flow through an SSRF-guarded image proxy with AVIF/WebP CDN caching
- **Performance-tuned** — in-process caching, CDN headers, and optimized bundle
- **Quality gates** — Biome lint, TypeScript checking, and Vitest test suite

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

Open [http://localhost:3000](http://localhost:3000) to start streaming.

### Adding content sources

To add a new content source, configure a provider module in `src/providers/` and add its entry to `src/providers/urls.ts`. See the provider documentation for details.

## License

Distributed under the [GNU AGPL-3.0](./LICENSE).

## Disclaimer

Harustream is a **self-hosted front-end and provider-runtime engine**. It hosts, stores, uploads, or serves no media itself — all content is resolved from third-party provider modules configured entirely by whoever deploys it. This project exists for educational purposes; users are responsible for complying with the laws of their jurisdiction and the terms of any provider they connect.
