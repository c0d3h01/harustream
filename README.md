# Harustream

Harustream is a self-hosted streaming web app for anime, movies, and web series. Everything is resolved through pluggable **providers** — content sources you configure yourself.

## Features

- **Plugin-based providers** — add or remove content sources by configuring provider modules
- **Multi-provider search & feeds** — search and featured content fan out across all configured providers
- **Immersive player** — Vidstack-powered playback with quality selection, subtitles, and HLS/DASH support
- **Optimized artwork** — posters and backdrops flow through an SSRF-guarded image proxy with AVIF/WebP CDN caching
- **Performance-tuned** — in-process caching, CDN headers, and optimized bundle
- **Quality gates** — Biome lint, TypeScript checking, and Vitest test suite

## Disclaimer

> [!WARNING]
> Harustream is a **self-hosted front-end and provider-runtime engine**.
> It hosts, stores, uploads, or serves no media itself.
> All content is resolved from third-party provider modules configured entirely by whoever deploys it.
> This project exists for educational purposes.
> Users are responsible for complying with the laws of their jurisdiction and the terms of any provider they connect.
