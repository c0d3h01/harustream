import { z } from 'zod';
import { config, projectRoot, SERVER_NAME, SERVER_VERSION } from '../config.js';
import { getRegisteredToolCount, okStructured, tool } from '../server.js';
import { READ_ONLY } from '../types.js';
import { runCmd } from '../utils/exec.js';

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
  memory_mb: z.object({ rss: z.number(), heap_used: z.number(), heap_total: z.number() }),
  limits: z.object({
    command_timeout_ms: z.number(),
    max_buffer_mb: z.number(),
    max_response_mb: z.number(),
    read_concurrency: z.number(),
    network_concurrency: z.number(),
    max_codebase_files: z.number(),
    allow_file_writes: z.boolean(),
    allow_arbitrary_commands: z.boolean(),
  }),
});

tool({
  name: 'haru_health_check',
  title: 'Server Health',
  description: `Report liveness and runtime metadata: identity, process stats, git branch, registered tool count, and active configuration limits.

Read-only. No arguments.`,
  inputSchema: z.object({}).strict(),
  annotations: READ_ONLY,
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
        command_timeout_ms: config.commandTimeoutMs,
        max_buffer_mb: Math.round(config.maxBufferBytes / (1024 * 1024)),
        max_response_mb: Math.round(config.maxResponseBytes / (1024 * 1024)),
        read_concurrency: config.readConcurrency,
        network_concurrency: config.networkConcurrency,
        max_codebase_files: config.maxCodebaseFiles,
        allow_file_writes: config.allowFileWrites,
        allow_arbitrary_commands: config.allowArbitraryCommands,
      },
    };
    const text =
      `### Server\n` +
      `- **name:** ${payload.server_name}\n` +
      `- **version:** ${payload.server_version}\n` +
      `- **tools registered:** ${payload.tools_registered}\n\n` +
      `### Process\n` +
      `- **pid:** ${payload.pid}\n` +
      `- **uptime_ms:** ${payload.uptime_ms}\n` +
      `- **node:** ${payload.node}\n` +
      `- **platform:** ${payload.platform} / ${payload.arch}\n` +
      `- **cwd:** ${payload.cwd}\n\n` +
      `### Memory (MB)\n` +
      `- **rss:** ${payload.memory_mb.rss}\n` +
      `- **heap_used:** ${payload.memory_mb.heap_used}\n` +
      `- **heap_total:** ${payload.memory_mb.heap_total}\n\n` +
      `### Git\n` +
      `- **branch:** ${payload.git_branch}\n\n` +
      `### Limits\n` +
      `- **command_timeout_ms:** ${payload.limits.command_timeout_ms}\n` +
      `- **max_response_mb:** ${payload.limits.max_response_mb}\n` +
      `- **read_concurrency:** ${payload.limits.read_concurrency}\n` +
      `- **network_concurrency:** ${payload.limits.network_concurrency}\n` +
      `- **max_codebase_files:** ${payload.limits.max_codebase_files}\n` +
      `- **allow_file_writes:** ${payload.limits.allow_file_writes}\n` +
      `- **allow_arbitrary_commands:** ${payload.limits.allow_arbitrary_commands}`;
    return okStructured(payload, text);
  },
});
