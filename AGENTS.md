# AGENTS.md

Self-hosted anime/movie/streaming app. Single Next.js 16 (App Router) package, **pnpm** (not npm). Remix-like i18n via a middleware in `src/proxy.ts` that redirects unprefixed paths to `/en`, `/ja`, etc. UI routes live under `src/app/[lang]/`.

## Commands (see `package.json`)

- `pnpm dev` — Next dev server. No required env vars (providers are built-in); copy `.env.example` → `.env.local` only if you need stream-proxy signing.
- `pnpm lint` — Biome check. `pnpm lint:fix` auto-fixes; `pnpm format` rewrites.
- `pnpm typecheck` — `tsc --noEmit` (strict).
- `pnpm test` — Vitest, **mocked / no network**. Tests live in `tests/**/*.test.ts` (alias `@` → `src`).
- `pnpm test:providers` — **live** network smoke tests against real provider sites (opt-in). Runs `pnpm providers:update-urls` first automatically, so URLs stay fresh.
- `pnpm providers:update-urls` — probes every provider, follows redirects/mirrors, rewrites `src/providers/urls.ts` in place. `--dry-run`, `--check`, `--json`.
- `pnpm mcp:serve` / `mcp:watch` — run the repo's MCP server (`src/mcp/`).

Quality gates before PR (CI runs `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm audit --audit-level=high`, split across parallel `ci.yml` jobs): `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.

## Provider system (the core, and easy to get wrong)

Providers are **built-in modules** (anikoto, torrentio, movieBoxWeb, vega) — there is no remote manifest and no `node:vm` runtime anymore. Two files must agree for a provider to be live:

1. `src/providers/urls.ts` — typed config (id, name, url); also defines display order. One-line disable = delete the entry.
2. `src/providers/registry.ts` — code map importing each module and wiring id → implementation. Add/remove here too.

Rules that will bite you:
- Provider code returns **`Raw*` shapes**; normalized app types live in `src/services/`. Do **not** import normalized types into provider folders.
- Base URL is read synchronously via `providerBaseUrl('id')` at module top-level as `const BASE_URL` — never hardcode a URL twice.
- Wrap fetch errors with `throwProviderError('ProviderName', 'operation', err)`; return empty arrays for "nothing found".
- `noConsole` is a warning — no `console.log` in provider logic.
- No cross-provider imports; shared logic goes in `src/providers/_shared/`.
- Read `src/providers/README.md` — the definitive add/remove/maintain guide.

## Layering & architecture

`src/app/` routes are thin HTTP glue only. Real logic lives in:
- `src/providers/` — the plugin engine (registry, per-provider TTL cache w/ single-flight, `_shared/` infra).
- `src/services/` — domain layer: `catalog.ts`, `search.ts`, `fanout.ts`, `featured.ts`, `sources.ts`, `normalize.ts`, `media.ts`, `episodes.ts`.
- `src/validations/` — Zod schemas that parse untrusted provider output.
- `src/types/` — normalized app-facing types (the `Raw*` → normalized shape lives here).
- `src/lib/` — client fetchers, hooks, state, logging, i18n.
- `src/components/` — UI grouped by feature.

There is **no `docs/ARCHITECTURE.md`** in this repo (referenced by the old README but never exists) — treat `src/providers/README.md` + this file as the source of truth.

## Non-obvious gotchas

- **Locale routing**: `src/proxy.ts` (Next.js `proxy`, not `middleware`) redirects all non-prefixed, non-API paths to the user's locale. Any new UI page must go under `src/app/[lang]/`; locale-prefixed handling is automatic.
- **Image proxy**: poster/backdrop/logo `<Image>` srcs are **relative** `/api/image/<encoded-upstream>` URLs (SSRF-guarded), so `next.config.mjs` needs no `localPatterns`/CDN allowlist. Don't add plain external image URLs to next.config.
- **Stream proxy**: media streams go through a Cloudflare Worker (`src/proxy/`, deploy via wrangler) fronted by `NEXT_PUBLIC_STREAM_PROXY_URL`, falling back to the built-in `/api/proxy`. DASH (`.mpd`) plays direct (embed-friendly CDNs); HLS is rewritten to loop through the worker. Egress forwarding modes exist — see the recent stream-proxy commits/tests before touching.
- **Needs signing in prod**: `STREAM_PROXY_SECRET` on both app and worker enables HMAC-signed passthrough (otherwise `/api/proxy` is an open relay). Dev only: `STREAM_PROXY_ALLOW_PRIVATE`.
- **Provider fetch logic is the security boundary** — providers scrape untrusted upstream sites; keep validation (`src/validations/`) and URL handling tight, and never proxy arbitrary targets without the SSRF guard / signing.
- **No per-provider Biome overrides** — `biome.jsonc` applies the same strict lint rules to provider code as everywhere else. Intentional-yet-unused contract params on `ProviderModule` methods (e.g. `ctx`, `type`) must be `_`-marked in code (destructure as `{ ctx: _ctx }`) rather than special-cased.

## Toolchain / env quirks

- Nix flake is layered in via `.envrc` (`use flake`) and `.vscode/settings.json`; the dev shell provides node/pnpm/biome/language servers. `NEXT_TELEMETRY_DISABLED=1` is set by the shell hook.
- Env config is all via env vars — no var is required for local dev. Full annotated list in `.env.example`; copy to `.env.local` only when you need stream-proxy signing or custom fan-out limits.
- `pnpm-workspace.yaml` notes this is a **single package, not a monorepo** — `allowBuilds` (esbuild/msw/sharp/workerd) replaces the old `onlyBuiltDependencies`, don't reintroduce the removed key. It also carries an `overrides` entry pinning `@modelcontextprotocol/sdk` to a patched release (GHSA-345p-7cg4-v4c7); don't remove it or the `audit` gate goes red.

## Conventions

- Commits follow **Conventional Commits** (e.g. `feat(proxy): …`, `perf(ui): …`, `fix(infra): …`).
- Code formatting: Biome (single quotes, semicolons always, 2-space, 100-col). `pnpm format` fixes.
- Tests are colocated by domain under `tests/`; new domain logic should get a mocked Vitest test + (for providers) coverage in `tests/live/providers.test.ts`.

## Repo tooling

- A repo-local MCP server (`haru-mcp`) is registered in `.agents/mcp.json` and runs via `src/mcp/`; it exposes self-review and quality-check tools. Run the repo self-review (tests/tsc/biome/console.log scan) before finishing a change.
