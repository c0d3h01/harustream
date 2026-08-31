import { z } from 'zod';
import { config, esc, logger, runCmd, safeRepoRelative, tool, toolError } from './core.js';

// ============================================
// OPS / PERFORMANCE / LOG TOOLS
// ============================================

const READ_ONLY_HINTS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

// profile_performance 'analyze' executes an arbitrary command.
const ANALYZE_HINTS = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false,
} as const;

/**
 * Restricts a log path to a repo-relative file inside the project root.
 * Blocks absolute paths, traversal, and anything but safe filename chars.
 */
function safeLogFile(logFile: string): string {
  if (typeof logFile !== 'string' || logFile.trim() === '') {
    throw new Error('logFile must be a non-empty path');
  }
  if (logFile.length > 512) throw new Error('logFile exceeds 512 characters');
  if (logFile.includes('..')) throw new Error('logFile must not contain ".."');
  if (logFile.startsWith('/') || /^[A-Za-z]:[\\/]/.test(logFile)) {
    throw new Error('logFile must be a relative path');
  }
  return safeRepoRelative(logFile, 'logFile');
}

function clampLines(lines: number): number {
  return Math.min(Math.max(1, Math.trunc(lines)), config.maxTailLines);
}

function validLogMatch(logFile: string): Promise<{ exists: boolean; detail: string }> {
  return runCmd(`test -f ${esc(logFile)}`).then((r) => ({
    exists: r.code === 0,
    detail: r.stderr,
  }));
}

// ------------------------------------------------------------
// haru_profile_performance
// ------------------------------------------------------------

const ProfilePerformanceInput = z
  .object({
    action: z
      .enum(['start', 'stop', 'report', 'analyze'])
      .describe('start/stop/report measure this process; analyze runs a command repeatedly'),
    command: z.string().optional().describe('Command to time (required for analyze)'),
    iterations: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(1)
      .describe('Runs for analyze (1-100, default 1)'),
  })
  .strict();

tool({
  name: 'haru_profile_performance',
  title: 'Profile Performance',
  description: `Profile runtime performance: measure process memory/cpu (start/stop/report) or time a shell command (analyze).

- start/stop/report: read-only introspection of this MCP server's memory & uptime.
- analyze: runs the given command <iterations> times and reports avg/min/max/std-dev timing. Executes arbitrary shell commands and is gated by MCP_ALLOW_ARBITRARY_COMMANDS.

Args:
  - action ('start'|'stop'|'report'|'analyze')
  - command (string?): command to time (analyze only)
  - iterations (number): 1-100 (default 1)

Returns:
  Text timing/memory report.

Examples:
  - Use when: "Is the MCP server low on memory?" -> action=report
  - Use when: "How slow is git grep in this repo?" -> action=analyze, command="git grep -n buildDependencyGraph", iterations=3

Error Handling:
  - analyze with arbitrary commands disabled -> Error: set MCP_ALLOW_ARBITRARY_COMMANDS=true
  - Unknown action -> Error with accepted values`,
  inputSchema: ProfilePerformanceInput,
  annotations: ANALYZE_HINTS,
  callback: async ({ action, command, iterations }) => {
    try {
      switch (action) {
        case 'start': {
          const startMem = process.memoryUsage();
          return {
            content: [
              {
                type: 'text',
                text:
                  `Performance profiling started at ${new Date().toISOString()}\n` +
                  `Initial Memory: ${JSON.stringify(startMem, null, 2)}`,
              },
            ],
          };
        }

        case 'stop': {
          const endMem = process.memoryUsage();
          return {
            content: [
              {
                type: 'text',
                text:
                  `Performance profiling stopped\n` +
                  `Memory Delta: ${JSON.stringify(endMem, null, 2)}`,
              },
            ],
          };
        }

        case 'report': {
          const report = {
            timestamp: new Date().toISOString(),
            memory: process.memoryUsage(),
            cpu: process.cpuUsage(process.cpuUsage()),
            uptime: process.uptime(),
          };
          return {
            content: [
              { type: 'text', text: `Performance Report:\n\n${JSON.stringify(report, null, 2)}` },
            ],
          };
        }

        case 'analyze': {
          if (!command) {
            return toolError('command is required for the analyze action');
          }
          if (!config.allowArbitraryCommands) {
            return toolError(
              'arbitrary command execution is disabled',
              'Set MCP_ALLOW_ARBITRARY_COMMANDS=true to enable this diagnostic action',
            );
          }

          const safeIterations = Math.min(Math.max(1, Math.trunc(iterations)), 100);

          const times: number[] = [];
          for (let i = 0; i < safeIterations; i += 1) {
            const start = Date.now();
            await runCmd(command, { timeout: 60_000 });
            times.push(Date.now() - start);
          }

          const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
          const minTime = Math.min(...times);
          const maxTime = Math.max(...times);
          const stdDev = Math.sqrt(
            times.reduce((sq, n) => sq + (n - avgTime) ** 2, 0) / times.length,
          );

          logger.info({ event: 'arbitrary_command', command });

          return {
            content: [
              {
                type: 'text',
                text:
                  `Performance Analysis for: ${command}\n\n` +
                  `Iterations: ${safeIterations}\n` +
                  `Average: ${avgTime}ms\n` +
                  `Min: ${minTime}ms\n` +
                  `Max: ${maxTime}ms\n` +
                  `Deviation: ${stdDev.toFixed(2)}ms`,
              },
            ],
          };
        }

        default:
          return toolError(
            `unknown action: ${String(action)}`,
            "Accepted: 'start', 'stop', 'report', 'analyze'",
          );
      }
    } catch (err) {
      return toolError(
        'performance profiling failed',
        `Details: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },
});

// ------------------------------------------------------------
// haru_get_logs
// ------------------------------------------------------------

const GetLogsInput = z
  .object({
    logFile: z
      .string()
      .default('dev_runtime.log')
      .describe("Repo-relative log path, e.g. 'dev_runtime.log'"),
    filter: z.string().optional().describe('Regex filter applied to the tailed lines'),
    tail: z
      .number()
      .int()
      .min(1)
      .max(5000)
      .default(100)
      .describe('Lines to tail (1-5000, default 100)'),
  })
  .strict();

tool({
  name: 'haru_get_logs',
  title: 'Get System Logs',
  description: `Retrieve and filter lines from an application log file inside the repository.

Read-only.

Args:
  - logFile (string): repo-relative log path (default 'dev_runtime.log')
  - filter (string?): regex applied to tailed lines
  - tail (number): lines to read, 1-5000 (default 100)

Returns:
  Text: the matching lines, or "No logs found in <file>" when empty.

Examples:
  - Use when: "Show the last 50 lines of dev_runtime.log with errors" -> logFile="dev_runtime.log", tail=50, filter="error"
  - Use when: "Any warnings in runtime.log?" -> filter="warn"

Error Handling:
  - Log file missing -> Error: Log file not found
  - Invalid regex -> Error with the offending pattern`,
  inputSchema: GetLogsInput,
  annotations: READ_ONLY_HINTS,
  callback: async ({ logFile, filter, tail }) => {
    try {
      const relFile = safeLogFile(logFile);
      const tailLines = clampLines(tail);

      if (!(await validLogMatch(relFile)).exists) {
        return toolError(
          `log file not found: ${relFile}`,
          'Check the repo-relative path is correct',
        );
      }

      const { stdout, stderr, code } = await runCmd(`tail -n ${tailLines} ${esc(relFile)}`);
      if (code !== 0) {
        return toolError('could not tail logs', stderr || undefined);
      }

      let result = stdout;
      if (filter) {
        try {
          const filterRegex = new RegExp(filter, 'gi');
          result = result
            .split('\n')
            .filter((line) => filterRegex.test(line))
            .join('\n');
        } catch {
          return toolError(`invalid filter regex: ${filter}`);
        }
      }

      return {
        content: [{ type: 'text', text: result.trim() ? result : `No logs found in ${relFile}.` }],
      };
    } catch (err) {
      return toolError(
        'failed to retrieve logs',
        `Details: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },
});

// ------------------------------------------------------------
// haru_tail_logs
// ------------------------------------------------------------

const TailLogsInput = z
  .object({
    logFile: z
      .string()
      .default('dev_runtime.log')
      .describe("Repo-relative log path, e.g. 'dev_runtime.log'"),
    lines: z
      .number()
      .int()
      .min(1)
      .max(5000)
      .default(100)
      .describe('Lines to tail (1-5000, default 100)'),
    filter: z.string().optional().describe('Regex filter applied to the tailed lines'),
    highlight: z
      .array(z.string())
      .default(['error', 'warn', 'ERROR', 'WARN'])
      .describe('Patterns to bold in the output'),
  })
  .strict();

tool({
  name: 'haru_tail_logs',
  title: 'Tail Dev Logs',
  description: `Tail a runtime log file with optional regex filter and highlighting of interesting patterns.

Read-only.

Args:
  - logFile (string): repo-relative log path (default 'dev_runtime.log')
  - lines (number): lines to read, 1-5000 (default 100)
  - filter (string?): regex applied to tailed lines
  - highlight (string[]): patterns bolded in the output (default ['error','warn','ERROR','WARN'])

Returns:
  Text: tailed lines with **highlighted** matches, or "No logs found in <file>".

Examples:
  - Use when: "Tail the last 200 lines of runtime.log" -> lines=200
  - Use when: "Show me exactly the 4xx errors" -> filter=" 4[0-9]{2} "

Error Handling:
  - Log file missing -> Error: Log file not found
  - Invalid regex -> Error with the offending pattern`,
  inputSchema: TailLogsInput,
  annotations: READ_ONLY_HINTS,
  callback: async ({ logFile, lines, filter, highlight }) => {
    try {
      const relFile = safeLogFile(logFile);
      const tailLines = clampLines(lines);

      if (!(await validLogMatch(relFile)).exists) {
        return toolError(
          `log file not found: ${relFile}`,
          'Check the repo-relative path is correct',
        );
      }

      const { stdout, stderr, code } = await runCmd(`tail -n ${tailLines} ${esc(relFile)}`);
      if (code !== 0) {
        return toolError('could not tail logs', stderr || undefined);
      }

      let result = stdout;
      if (filter) {
        try {
          const filterRegex = new RegExp(filter, 'gi');
          result = result
            .split('\n')
            .filter((line) => filterRegex.test(line))
            .join('\n');
        } catch {
          return toolError(`invalid filter regex: ${filter}`);
        }
      }

      for (const pattern of highlight) {
        result = result.replace(new RegExp(pattern, 'gi'), (match) => `**${match}**`);
      }

      return {
        content: [{ type: 'text', text: result.trim() ? result : `No logs found in ${relFile}.` }],
      };
    } catch (err) {
      return toolError(
        'failed to tail logs',
        `Details: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },
});
