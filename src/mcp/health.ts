import { z } from 'zod';
import {
  getRegisteredToolCount,
  projectRoot,
  runCmd,
  SERVER_NAME,
  SERVER_VERSION,
  tool,
} from './core.js';

// ============================================
// OBSERVABILITY
// ============================================

const HealthCheckOutput = z.object({
  server_name: z.string(),
  server_version: z.string(),
  pid: z.number(),
  uptime_ms: z.number(),
  node: z.string(),
  platform: z.string(),
  arch: z.string(),
  cwd: z.string(),
  git_branch: z.string(),
  tools_registered: z.number(),
  memory_mb: z.object({
    rss: z.number(),
    heap_used: z.number(),
    heap_total: z.number(),
  }),
  limits: z.object({
    command_timeout_ms: z.number(),
    max_buffer_mb: z.number(),
    max_response_mb: z.number(),
    read_concurrency: z.number(),
    allow_file_writes: z.boolean(),
    allow_arbitrary_commands: z.boolean(),
  }),
});

tool({
  name: 'haru_health_check',
  title: 'Server Health',
  description: `Report liveness and runtime metadata for the MCP server: identity, process stats, git branch, registered tool count, and active configuration limits.

Read-only.

Args:
  - none

Returns:
  Structured: { server_name, server_version, pid, uptime_ms, node, platform, arch, cwd, git_branch, tools_registered, memory_mb, limits }

Examples:
  - Use when: "Is the MCP server alive and what its limits?" -> no args
  - Use when: "Which env limits are in effect right now?" -> read limits block`,
  inputSchema: z.object({}),
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  outputSchema: HealthCheckOutput,
  callback: async () => {
    const gitBranch = await runCmd('git rev-parse --abbrev-ref HEAD 2>/dev/null');
    const mem = process.memoryUsage();

    const payload: z.infer<typeof HealthCheckOutput> = {
      server_name: SERVER_NAME,
      server_version: SERVER_VERSION,
      pid: process.pid,
      uptime_ms: Math.round(process.uptime() * 1000),
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cwd: projectRoot,
      git_branch: gitBranch.code === 0 ? gitBranch.stdout.trim() : 'unknown',
      tools_registered: getRegisteredToolCount(),
      memory_mb: {
        rss: Math.round(mem.rss / 1024 / 1024),
        heap_used: Math.round(mem.heapUsed / 1024 / 1024),
        heap_total: Math.round(mem.heapTotal / 1024 / 1024),
      },
      limits: {
        command_timeout_ms: process.env.MCP_COMMAND_TIMEOUT_MS
          ? Number(process.env.MCP_COMMAND_TIMEOUT_MS)
          : 30000,
        max_buffer_mb: process.env.MCP_MAX_BUFFER_MB ? Number(process.env.MCP_MAX_BUFFER_MB) : 100,
        max_response_mb: process.env.MCP_MAX_RESPONSE_MB
          ? Number(process.env.MCP_MAX_RESPONSE_MB)
          : 4,
        read_concurrency: process.env.MCP_READ_CONCURRENCY
          ? Number(process.env.MCP_READ_CONCURRENCY)
          : 10,
        allow_file_writes: process.env.MCP_ALLOW_FILE_WRITES !== 'false',
        allow_arbitrary_commands: process.env.MCP_ALLOW_ARBITRARY_COMMANDS !== 'false',
      },
    };

    const text = `### Server\n- **name:** ${payload.server_name}\n- **version:** ${payload.server_version}\n- **tools registered:** ${payload.tools_registered}\n\n### Process\n- **pid:** ${payload.pid}\n- **uptime_ms:** ${payload.uptime_ms}\n- **node:** ${payload.node}\n- **platform:** ${payload.platform} / ${payload.arch}\n- **cwd:** ${payload.cwd}\n\n### Memory (MB)\n- **rss:** ${payload.memory_mb.rss}\n- **heap_used:** ${payload.memory_mb.heap_used}\n- **heap_total:** ${payload.memory_mb.heap_total}\n\n### Git\n- **branch:** ${payload.git_branch}`;

    return {
      content: [{ type: 'text', text }],
      structuredContent: payload as Record<string, unknown>,
    };
  },
});
