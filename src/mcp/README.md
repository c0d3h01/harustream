# haru-mcp-server

Model Context Protocol server for the **harustream** repository. Provides 20 tools
for codebase search, file reading/editing, dependency analysis, quality gates, git
review, test runs, agent planning, and liveness observability.

- **Protocol**: MCP (stdio / streamable HTTP)
- **Identity**: `haru-mcp-server` v5.0.0 (client namespace: `haru-mcp`)
- **SDK**: `@modelcontextprotocol/sdk` ≥ 1.30 (modern `registerTool` API)
- **Runtime**: Node ≥ 20, `tsx`, pnpm

## What's new in v5

- **Reusable components**: shared `utils/exec.ts`, `utils/grep.ts`, `utils/glob.ts`,
  `utils/pagination.ts`, `utils/format.ts`, `utils/fs.ts`, `utils/concurrency.ts`.
  Each tool file only contains the schema + handler.
- **Bugs fixed**:
  - `haru_smart_search` symbol search now returns real symbol hits (it used to
    reject any query containing regex meta-characters).
  - `haru_search_codebase` no longer rejects queries like `fetch(` — the pattern
    guard previously bailed on every `(` or `)`.
  - `haru_get_file_signatures` returns bare symbol names (e.g. `parseGrepLines`)
    instead of full `export const X` lines.
  - `haru_read_codebase` is budget-aware: it skips (not aborts) when a file
    exceeds the response budget, and never reloads the entire repo for a
    dependency graph.
  - `haru_refactor_codebase` `move` / `inline` operations now actually rewrite
    the file content and report `changed` vs `unchanged` per file.
  - `haru_tail_logs` highlight no longer double-wraps `**error**` to `****error****`.
  - `haru_check_quality` honors the `strict` flag and exposes it in the output.
  - `haru_format_lint` exit-0 path no longer reports "found issues".
  - `haru_analyze_dependencies` uses `git grep` (one pass) instead of
    `find` + `readFileFull` for every file to detect used packages.
  - `haru_plan_build` uses `git ls-files` (one command) instead of a full
    re-read of the repo.
  - All tools that declare an `outputSchema` always return `structuredContent`
    on success (the SDK 1.30 protocol rejects schema'd results without it).
- **Safer defaults**: `MCP_ALLOW_FILE_WRITES` and `MCP_ALLOW_ARBITRARY_COMMANDS`
  both default to **off**; the server must be explicitly opted in for write
  or shell-execution tools.
- **Lower RAM pressure**:
  - `haru_read_codebase` no longer spawns a full dependency graph in-request.
  - `haru_analyze_dependencies` and `haru_plan_build` use single-shot git
    commands instead of file-by-file scans.
  - `haru_check_quality` runs gates serially with explicit timeouts.
  - `haru_agent_self_review` caps each gate at 90s and can skip the heaviest
    check via `skipTests=true`.
- **Better file structure**:
  ```
  src/mcp/
  ├── index.ts          # boot (stdio/http), signal handling
  ├── server.ts         # McpServer + tool() registration wrapper
  ├── config.ts         # env parsing, safePath, projectRoot
  ├── types.ts          # result types, annotation presets
  ├── utils/            # exec, fs, grep, glob, pagination, format, concurrency
  └── tools/            # one file per domain
      ├── codebase.ts        # read_codebase, search, smart_search, read_file, signatures
      ├── files.ts           # edit_file, write_file, refactor_codebase
      ├── git.ts             # review_changes
      ├── quality.ts         # check_quality, run_tests, format_lint
      ├── health.ts          # health_check
      ├── ops.ts             # profile_performance, get_logs, tail_logs
      ├── planning.ts        # plan_build, plan_task
      ├── dependencies.ts    # analyze_dependencies
      └── agent.ts           # agent_self_review
  ```

## Tool surface (unchanged)

All 20 tool names are preserved from v4 so existing agents keep working:

| Category | Tools |
| --- | --- |
| Codebase | `haru_read_codebase`, `haru_smart_search`, `haru_search_codebase`, `haru_read_file`, `haru_get_file_signatures` |
| Edit | `haru_edit_file`, `haru_refactor_codebase`, `haru_write_file` |
| Quality | `haru_run_tests`, `haru_check_quality`, `haru_format_lint` |
| Dependencies | `haru_analyze_dependencies` |
| Git | `haru_review_changes` |
| Planning | `haru_plan_build`, `haru_plan_task` |
| Agent flow | `haru_agent_self_review` |
| Ops | `haru_profile_performance`, `haru_get_logs`, `haru_tail_logs` |
| Observability | `haru_health_check` |

Every tool declares MCP **annotations** (`readOnlyHint`, `destructiveHint`,
`idempotentHint`, `openWorldHint`), a `.strict()` Zod input schema, and a
description with **Args** and **Returns**. Data-returning tools expose an
`outputSchema` and return `structuredContent` on every non-error result.

## Configuration

All knobs are environment variables (read once at startup):

| Variable | Default | Meaning |
| --- | --- | --- |
| `MCP_COMMAND_TIMEOUT_MS` | `30000` | Per-shell-command timeout |
| `MCP_MAX_BUFFER_MB` | `10` | Per-command stdout/stderr capture cap |
| `MCP_MAX_RESPONSE_MB` | `4` | Per-tool response cap before truncation |
| `MCP_CHARACTER_LIMIT` | `25000` | Per-tool response cap in characters |
| `MCP_READ_CONCURRENCY` | `4` | Parallel repo file reads |
| `MCP_NETWORK_CONCURRENCY` | `2` | Parallel registry lookups |
| `MCP_MAX_TAIL_LINES` | `500` | Hard cap for log tailing tools |
| `MCP_MAX_CODEBASE_FILES` | `200` | Max files processed by `haru_read_codebase` |
| `MCP_ALLOW_FILE_WRITES` | `false` | **Default off** — opt in for write tools |
| `MCP_ALLOW_ARBITRARY_COMMANDS` | `false` | **Default off** — required for `haru_profile_performance` analyze |
| `MCP_LOG_LEVEL` | `info` | pino level |

> ⚠️ **Breaking default change vs v4**: `MCP_ALLOW_FILE_WRITES` and
> `MCP_ALLOW_ARBITRARY_COMMANDS` now default to `false`. Add the env vars
> to your shell / `.env` to restore the old behavior.

`haru_profile_performance.analyze` runs user-supplied commands; logs always go to
**stderr** only (stdio strictly carries protocol messages). All `npx`
invocations use `--no-install`.

## Registering the server

```json
{
  "servers": {
    "haru-mcp": {
      "type": "local",
      "command": ["pnpm", "exec", "tsx", "src/mcp/index.ts"],
      "env": {
        "MCP_ALLOW_FILE_WRITES": "true"
      }
    }
  }
}
```

## Development

```bash
# UI smoke test (stdio)
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' |
  pnpm exec tsx src/mcp/index.ts

# Gates
npx tsc --noEmit
npx biome check src/mcp

# Fast unit tests (no server spawn)
pnpm test

# Full integration suite (spawns the stdio server; opt-in)
pnpm test:integration
```

## Evaluation

A 10-question read-only evaluation is shipped as `evaluation.xml`. Run it with
the skill's harness:

```bash
pip install -r ~/.agents/skills/mcp-builder/scripts/requirements.txt
export ANTHROPIC_API_KEY=...
python ~/.agents/skills/mcp-builder/scripts/evaluation.py \
  -t stdio -c pnpm -a exec tsx src/mcp/index.ts \
  -o /tmp/haru_mcp_eval.md src/mcp/evaluation.xml
```

> **Note**: a few evaluation questions reference v4 defaults that changed in v5
> (e.g. `MCP_ALLOW_FILE_WRITES` default flipped to `false`,
> `command_timeout_ms` default changed from 30000 to 30000 — that one is
> actually unchanged). Update the XML to match v5 if you need it to pass
> verbatim.
