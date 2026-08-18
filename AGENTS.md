# AGENTS.md

Streaming frontend (Next.js 16 App Router, React 19, TS strict, Tailwind v4) that proxies an upstream provider API. No test suite exists.

## Commands

- Dev: `pnpm dev` (or `just dev`). Build: `pnpm build`. Start: `pnpm start`.
- Lint: `pnpm lint` (`biome check .`), fix: `pnpm lint:fix`. Format: `pnpm format`.
- Typecheck: `pnpm typecheck`. `just check` = typecheck then lint.
- **Package manager is pnpm** (only `pnpm-lock.yaml` exists). The justfile defaults to `npm`, and `just setup`/`npm ci` will fail without a `package-lock.json` — run `NPM=pnpm just setup` or use pnpm directly. Never commit a `package-lock.json`.

## Architecture

- Everything lives under `src/` (`app/`, `components/`, `lib/`, `proxy.ts`, `instrumentation.ts`); `@/*` maps to `src/*`. Components are split into `ui/` (primitives), `layout/` (app chrome), `motion/` (shared motion variants/transitions), and `features/<name>/` (each with an `index.ts` barrel). Prefer direct-subpath imports over the barrels in app code.
- All upstream traffic goes through `providerFetch` (`src/lib/api/provider.ts`) — never fetch the provider from the browser (no CORS). It adds per-request timeout, retries with backoff, failover across `PROVIDER_BASES`, and a per-base circuit breaker (30s cooldown, 4xx doesn't trip it).
- Providers are **not** configured in env; the live list is fetched from the upstream at runtime (`GET /api/providers`) into a module registry (`src/lib/api/providers.ts`). No hardcoded fallback list.
- Every `/api` route returns the shared error envelope `{ error, code?, requestId? }` via `apiErrorResponse` (`src/lib/api/respond.ts`) and logs through `scopeLogger` with the request id.
- `src/proxy.ts` (Next 16 middleware) runs on the edge runtime: stamps `x-request-id` and logs every `/api` request. It cannot use pino — plain `console.log` with `biome-ignore` comments is the established pattern there. Use `proxy.ts`, not `middleware.ts` (renamed in Next 16).
- Two playback paths:
  - HLS: `hls.js` → `/api/proxy?url=` (`src/lib/media/streamProxy.ts`). Manifests are rewritten so segments/key/playlists all route through the proxy; Referer/User-Agent/Origin injected; SSRF guard on private hosts.
  - Non-browser codecs (e.g. MKV): `/api/play` spawns `ffmpeg` (`src/lib/media/transcode.ts`) → fMP4 consumed via MediaSource; codec passed in `X-Haru-Codec` header. The binary resolves from `FFMPEG_PATH` → the bundled `ffmpeg-static` binary (ships in the deployment, so it works on Vercel) → `ffmpeg` on PATH. Probing runs through the same binary (`-i <url> -t 0 -f null -` + stderr parse) — no `ffprobe` needed. `/api/play` sets `maxDuration = 300` (Vercel Hobby cap; the remux must finish inside the invocation budget).
- Client-side stream resilience in `src/lib/api/client.ts`: 30s negative-result cache, provider-ordering and hub-ordering fallbacks (`resolveMovieStream`, `getStreamFallback`, `resolveSeriesEpisodes`).
- Logging: pino (`src/lib/log.ts`) — pretty in dev, JSON in prod; `LOG_LEVEL` env. Edge runtime falls back to JSON (no worker transport).

## Env & config

- `NEXT_PUBLIC_PROVIDER_API_URL` is required; copy `.env.example` → `.env` for dev. `.env.prod` and local `.env` are gitignored — never commit or expose them.
- `STREAM_PROXY_REFERER` defaults to `https://vidspark.to/`; the Vega/VidSpark CDN rejects requests without that referer.
- `next.config.mjs`: `agentRules: false`, images unoptimized, `optimizePackageImports: ['lucide-react']` only — do not add `@base-ui/react` there (it's imported via subpaths, no barrel to rewrite).

## Conventions

- Biome is the single formatter/linter: single quotes, double-quoted JSX, semicolons, trailing commas, 100-col width, organize-imports assist.
- Motion (the `motion` package) is used for presentation-only animation via `src/components/motion/` (shared variants/transitions, `usePrefersReducedMotion`); animate `transform`/`opacity` only, keep `"use client"` on the animated leaves, and never add motion to server/edge-only code. `MotionConfig reducedMotion="user"` in `App.tsx` handles reduced motion app-wide.
- Commit messages follow lowercase conventional style from git history (`feat:`, `fix:`, `chore(dev):`, ...).
- Always read `.agents/skills/` at the start of a task and follow any skill whose description matches the work — the set currently includes `vercel-react-best-practices` (React/Next perf rules), `systematic-debugging`, `next-dev-loop`, and more. When a matching skill exists, follow it.
