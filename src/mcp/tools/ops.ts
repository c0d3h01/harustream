import { z } from 'zod';
import { config, safeRepoRelative } from '../config.js';
import { logger, okText, tool, toolError } from '../server.js';
import { assertSafeLogFile, READ_ONLY } from '../types.js';
import { esc, runCmd } from '../utils/exec.js';

function clampLines(n: number): number {
  return Math.min(Math.max(1, Math.trunc(n)), config.maxTailLines);
}

async function tailFile(relFile: string, lines: number) {
  return runCmd(`tail -n ${clampLines(lines)} ${esc(relFile)}`);
}

async function fileExists(relFile: string): Promise<boolean> {
  return (await runCmd(`test -f ${esc(relFile)}`)).code === 0;
}

interface ReadLogsOpts {
  logFile: string;
  lines: number;
  filter?: string;
  highlight?: string[];
}

async function readLogs(opts: ReadLogsOpts): Promise<string> {
  const relFile = safeRepoRelative(assertSafeLogFile(opts.logFile), 'logFile');
  if (!(await fileExists(relFile))) throw new Error(`log file not found: ${relFile}`);
  const { stdout, stderr, code } = await tailFile(relFile, opts.lines);
  if (code !== 0) throw new Error(stderr || 'could not tail logs');
  let result = stdout;
  if (opts.filter) {
    try {
      const re = new RegExp(opts.filter, 'i');
      result = result
        .split('\n')
        .filter((line) => re.test(line))
        .join('\n');
    } catch {
      throw new Error(`invalid filter regex: ${opts.filter}`);
    }
  }
  if (opts.highlight?.length) {
    const escaped = opts.highlight.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const combined = new RegExp(`(${escaped.join('|')})`, 'gi');
    // Don't re-process already-bolded text — we operate on the raw filtered output.
    result = result.replace(combined, '**$1**');
  }
  return result.trim() ? result : `No logs found in ${relFile}.`;
}

// ---------- haru_profile_performance ----------

const ProfilePerformanceInput = z
  .object({
    action: z
      .enum(['start', 'stop', 'report', 'analyze'])
      .describe('start/stop/report = introspect this server; analyze = time a shell command'),
    command: z.string().optional().describe('Command to time (required for analyze)'),
    iterations: z.number().int().min(1).max(100).default(1).describe('Runs for analyze (1-100)'),
  })
  .strict();

tool({
  name: 'haru_profile_performance',
  title: 'Profile Performance',
  description: `Profile runtime performance.

- start/stop/report: read-only introspection of this MCP server's memory & uptime.
- analyze: runs \`command\` <iterations> times and reports avg/min/max/std-dev timing. Requires MCP_ALLOW_ARBITRARY_COMMANDS=true.`,
  inputSchema: ProfilePerformanceInput,
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
  callback: async ({ action, command, iterations }) => {
    try {
      switch (action) {
        case 'start':
          return okText(
            `Performance profiling started at ${new Date().toISOString()}\nInitial Memory: ${JSON.stringify(process.memoryUsage(), null, 2)}`,
          );
        case 'stop':
          return okText(
            `Performance profiling stopped\nMemory Delta: ${JSON.stringify(process.memoryUsage(), null, 2)}`,
          );
        case 'report': {
          const report = {
            timestamp: new Date().toISOString(),
            memory: process.memoryUsage(),
            cpu: process.cpuUsage(),
            uptime: process.uptime(),
          };
          return okText(`Performance Report:\n\n${JSON.stringify(report, null, 2)}`);
        }
        case 'analyze': {
          if (!command) return toolError('command is required for the analyze action');
          if (!config.allowArbitraryCommands) {
            return toolError(
              'arbitrary command execution is disabled',
              'Set MCP_ALLOW_ARBITRARY_COMMANDS=true to enable this diagnostic action.',
            );
          }
          const safeIterations = clampLines(iterations);
          const times: number[] = [];
          for (let i = 0; i < safeIterations; i += 1) {
            const start = Date.now();
            await runCmd(command, { timeout: 60_000 });
            times.push(Date.now() - start);
          }
          const avg = times.reduce((a, b) => a + b, 0) / times.length;
          const min = Math.min(...times);
          const max = Math.max(...times);
          const stdDev = Math.sqrt(times.reduce((sq, n) => sq + (n - avg) ** 2, 0) / times.length);
          logger.info({ event: 'arbitrary_command', command });
          return okText(
            `Performance Analysis for: ${command}\n\n` +
              `Iterations: ${safeIterations}\nAverage: ${avg.toFixed(1)}ms\nMin: ${min}ms\nMax: ${max}ms\nDeviation: ${stdDev.toFixed(2)}ms`,
          );
        }
      }
    } catch (err) {
      return toolError(
        'performance profiling failed',
        `Details: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },
});

// ---------- haru_get_logs ----------

const GetLogsInput = z
  .object({
    logFile: z
      .string()
      .default('dev_runtime.log')
      .describe("Repo-relative log path, e.g. 'dev_runtime.log'"),
    filter: z.string().optional().describe('Case-insensitive regex filter applied to tailed lines'),
    tail: z.number().int().min(1).max(5000).default(100).describe('Lines to tail (1-5000)'),
  })
  .strict();

tool({
  name: 'haru_get_logs',
  title: 'Get System Logs',
  description: `Tail a log file inside the repo and optionally filter lines by regex.

Read-only.

Args:
  - logFile (string, default 'dev_runtime.log')
  - filter (string?): regex
  - tail (1-5000, default 100)`,
  inputSchema: GetLogsInput,
  annotations: READ_ONLY,
  callback: async ({ logFile, filter, tail }) => {
    try {
      const text = await readLogs({ logFile, lines: tail, filter });
      return okText(text);
    } catch (err) {
      return toolError(
        'failed to retrieve logs',
        `Details: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },
});

// ---------- haru_tail_logs ----------

const TailLogsInput = z
  .object({
    logFile: z.string().default('dev_runtime.log').describe('Repo-relative log path'),
    lines: z.number().int().min(1).max(5000).default(100).describe('Lines to tail (1-5000)'),
    filter: z.string().optional().describe('Case-insensitive regex filter'),
    highlight: z
      .array(z.string())
      .default(['error', 'warn', 'ERROR', 'WARN'])
      .describe('Patterns to wrap in **bold** (case-insensitive)'),
  })
  .strict();

tool({
  name: 'haru_tail_logs',
  title: 'Tail Dev Logs',
  description: `Tail a log file with optional filter and bolding of interesting patterns.

Read-only.

Args:
  - logFile (string, default 'dev_runtime.log')
  - lines (1-5000, default 100)
  - filter (string?): regex
  - highlight (string[]): patterns to bold (default error/warn)`,
  inputSchema: TailLogsInput,
  annotations: READ_ONLY,
  callback: async ({ logFile, lines, filter, highlight }) => {
    try {
      const text = await readLogs({ logFile, lines, filter, highlight });
      return okText(text);
    } catch (err) {
      return toolError(
        'failed to tail logs',
        `Details: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },
});
