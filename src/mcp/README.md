# haru-mcp-server

Model Context Protocol server for the **harustream** repository. Provides 20 tools for
codebase search, file reading/editing, dependency analysis, quality gates, git review,
test runs, agent planning, and liveness observability.

- **Protocol**: MCP (stdio)
- **Identity**: `haru-mcp-server` v4.1.0 (client namespace: `haru-mcp`)
- **SDK**: `@modelcontextprotocol/sdk` ≥ 1.30 (modern `registerTool` API)
- **Runtime**: Node ≥ 20, `tsx`, pnpm

## Tool Naming

All tools use the scheme `haru_{action}_{resource}`:

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
`idempotentHint`, `openWorldHint`), a `.strict()` Zod input schema, and a rich
description (summary, **Args**, **Returns**, **Examples**, **Error Handling**).
Data-returning tools expose an `outputSchema` and return validated `structuredContent`
on every non-error result; search tools additionally support `responseFormat`
(`markdown` | `json`) and pagination (`limit`, `offset`, `has_more`, `next_offset`).

## Configuration

All knobs are environment variables (read once at startup):

| Variable | Default | Meaning |
| --- | --- | --- |
| `MCP_COMMAND_TIMEOUT_MS` | `30000` | Timeout for external shell commands |
| `MCP_MAX_BUFFER_MB` | `100` | Max captured stdout/stderr per command |
| `MCP_MAX_RESPONSE_MB` | `4` | Max tool response size (binary-search truncation) |
| `MCP_READ_CONCURRENCY` | `10` | Parallel repository file reads |
| `MCP_NETWORK_CONCURRENCY` | `5` | Parallel registry lookups (npm view/audit) |
| `MCP_MAX_TAIL_LINES` | `5000` | Hard cap for `haru_tail_logs` / `haru_get_logs` |
| `MCP_MAX_CODEBASE_FILES` | `2000` | Max files processed by `haru_read_codebase` |
| `MCP_ALLOW_FILE_WRITES` | `true` | Gate for all mutating tools (`false` disables writes) |
| `MCP_ALLOW_ARBITRARY_COMMANDS` | `false*` | Gate for arbitrary shell command execution |
| `MCP_LOG_LEVEL` | `info` | pino level |

`*` `haru_profile_performance` runs user-supplied commands; logs always go to **stderr**
only (stdio strictly carries protocol messages). All `npx` invocations use
`--no-install`. `haru_run_tests` / `haru_check_quality` / `haru_agent_self_review` also
respect `MCP_ALLOW_ARBITRARY_COMMANDS` where applicable.

## Registering the server (`/Users/harshal/dev/harustream/.agents/mcp.json`)

```json
{
  "servers": {
    "haru-mcp": {
      "type": "local",
      "command": ["pnpm", "exec", "tsx", "src/mcp/index.ts"]
    }
  }
}
```

## Examples

### Where is a symbol defined and who uses it?

```
1. haru_smart_search { query: "paginate", searchType: "symbol" }   -> definition site
2. haru_search_codebase { query: "paginate", responseFormat: "json" } -> all usages
3. haru_read_file { filePath: "src/mcp/core.ts", startLine: 1, endLine: 60 } -> context
```

### Check that pending work is merge-ready

```
1. haru_review_changes { includeStats: true }                 -> diff + stats
2. haru_run_tests { env: "typescript" }                       -> vitest
3. haru_check_quality { include: ["typescript", "biome"] }    -> tsc + biome
```

### Debug a failure

```
1. haru_health_check {}                                        -> identity + limits
2. haru_get_logs { logFile: "dev_runtime.log", filter: "error", tail: 500 }
3. haru_read_file { filePath: "src/.../<suspected file>.ts" }  -> targeted window
```

## Development

```bash
# UI smoke test (stdio)
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' |
  pnpm exec tsx src/mcp/index.ts

# Gates
npx tsc --noEmit
npx biome check --write src/mcp
```

## Evaluation

A 10-question read-only evaluation is shipped as `evaluation.xml`. Run it with the
skill's harness:

```bash
pip install -r ~/.agents/skills/mcp-builder/scripts/requirements.txt
export ANTHROPIC_API_KEY=...
python ~/.agents/skills/mcp-builder/scripts/evaluation.py \
  -t stdio -c pnpm -a exec tsx src/mcp/index.ts \
  -o /tmp/haru_mcp_eval.md src/mcp/evaluation.xml
```