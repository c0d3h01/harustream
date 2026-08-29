# AGENTS.md — Harustream

> **Single source of truth for AI agents working in this repo.**
> Read this before any task. Follow the MCP-first workflow below.

## Project Snapshot

- **Stack:** Next.js 16.3 (App Router) + React 19 + TypeScript 5.7 + Tailwind 4 + Biome 2.5 + Vitest
- **Runtime:** `node:vm` sandboxed providers (`src/providers/`), `src/media/` owns API contract, `src/app/` is thin HTTP glue — see `README.md:74-86`
- **Commands:** `just help` (see `justfile`) — `pnpm dev` / `pnpm build` / `pnpm lint` (`biome check`) / `pnpm typecheck` (`tsc --noEmit`) / `pnpm test` (`vitest`)
- **Config:** Env in `.env.example`; `PROVIDER_MANIFEST_URL` is required

## Mandatory: Use haru-mcp

**`haru-mcp` is the only approved interface for codebase analysis and edits.** Do not bypass it with raw `fs`/`shell`/`grep` unless the MCP tool is unavailable or a one-off shell check is needed.

- **Server:** `src/scripts/mcp.ts:16` — `McpServer(name: "haru-mcp", version: "4.0.0")` via `StdioServerTransport`
- **Config:** `opencode.json:13-22` — `type: local`, `command: ["pnpm","exec","tsx","src/scripts/mcp.ts"]`, `enabled: true`, `timeout: 300000`
- **Why:** Atomic writes with backup+revert, validation (`tsc --noEmit`), and consistent search/indexing. Direct edits skip safety checks.

### Tool Routing — Use This Table

| Task | MCP tool | Do not use |
|------|----------|------------|
| Get full codebase context | `read_entire_codebase` | manual `find`/`glob` |
| Find code / symbols | `smart_search` (`regex`/`symbol`/`fulltext`) or `search_codebase` | `grep`/`git grep` directly |
| Read a file / range | `read_file_chunk` (`filePath`, `startLine`, `endLine`) | `cat` |
| File signatures/exports | `get_file_signatures` | ad-hoc regex |
| Edit a file (small) | `atomic_file_edit` (`replace`/`insert`/`delete`/`overwrite`) | `sed`/`edit` without backup |
| Create/overwrite file | `write_file` | raw `write` |
| Multi-file rename/move | `refactor_codebase` (`rename`/`move`/`extract`/`inline`, `dryRun:true` first) | manual find-replace |
| Plan a task | `plan_agent_task` / `generate_build_plan` | skipping planning |
| Format/lint | `format_and_lint` | `npx biome` directly |
| Typecheck + lint + tests | `run_quality_gates` (`include: ["typescript","biome"]` or `["typescript","biome","tests"]`) | `tsc`/`biome`/`vitest` directly |
| Run tests | `run_tests` (`env: "typescript"`, `target`, `coverage`) | `vitest` directly |
| Review diff | `review_pending_changes` (`format: "unified"|"json"`) | `git diff` directly |
| Logs | `get_system_logs` / `tail_dev_logs` | `tail` |
| Dependencies | `analyze_dependencies` | `npm view` directly |
| Self-review before handoff | `agent_self_review` | skipping |

> **Defaults that matter:**
> - `read_entire_codebase:129` defaults: `includePatterns: ["**/*.{ts,tsx,json,yaml,yml}"]`, `excludePatterns: ["node_modules/**",".next/**","dist/**",".vercel/**","**/*.lock"]`, `maxFileSize: 1MB`
> - `run_quality_gates:1285` defaults: `include: ["typescript","biome"]` — `go`/`eslint` are legacy aliases only (`go` skips, `eslint` -> `biome`)
> - `write_file`/`atomic_file_edit` default `backup: true` + `validate: true` — leave them on

## Required Workflow

1.  **Plan:** `plan_agent_task` or `generate_build_plan` with task + scope.
2.  **Discover:** `smart_search` for symbols, `read_file_chunk` for ranges, `get_file_signatures` for interfaces. Use `read_entire_codebase` only when you need repo-wide context (it returns ~199 files, large payload).
3.  **Edit:** `atomic_file_edit` for surgical changes, `write_file` for new files, `refactor_codebase` with `dryRun: true` first for renames. Never edit without backup/validation.
4.  **Validate:** `run_quality_gates` (and `run_tests` if touching logic). Fix `tsc`/`biome` errors before proceeding.
5.  **Review:** `review_pending_changes` + `agent_self_review` before asking for human review. No `console.log` in production code (`biome.jsonc:30` `noConsole: warn`).

## Conventions

- **Formatting:** Biome with 2-space indent, 100-char line, `organizeImports: on` (`biome.jsonc:73`). Run `format_and_lint` with `write:true` if you change imports.
- **Types:** Strict. No `any` in non-vendored code; `src/providers/*` is vendored and lint-relaxed (`biome.jsonc:46`).
- **Tests:** `vitest.config.ts:12` includes `tests/**/*.test.ts`. Keep `tests/` green — current baseline is 70/71 passing (1 i18n locale gap unrelated to MCP).
- **Git:** Keep diffs narrow. Use `review_pending_changes` with `includeStats: true` to verify.

## Anti-Patterns (Will Be Rejected)

- Bypassing `haru-mcp` for edits/searches when an MCP tool exists.
- Running `find … -name "*.{ts,tsx}"` (brace expansion does not work with `find -name`) — use MCP's `read_entire_codebase` which now expands braces correctly (`src/scripts/mcp.ts:143`).
- Calling `git diff --json` (invalid) — use `review_pending_changes` `format: "json"`.
- Disabling `backup`/`validate` on `atomic_file_edit`/`write_file` without explicit user approval.

## Quick Check

Server is healthy if:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | pnpm exec tsx src/scripts/mcp.ts
```

returns `serverInfo: {name:"haru-mcp", version:"4.0.0"}` in <2s.
