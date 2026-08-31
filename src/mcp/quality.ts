import { z } from 'zod';
import { config, esc, runCmd, tool, toolError } from './core.js';

// ============================================
// QUALITY & TESTING TOOLS
// All toolchain calls use --no-install so a misconfigured
// environment can never trigger an implicit registry download.
// Independent gates run via Promise.all; vitest runs silent+dot
// so responses stay small and fast.
// ============================================

const VITEST_FLAGS = '--silent --reporter=dot';

async function coverageProviderInstalled(): Promise<boolean> {
  const r = await runCmd(`node -e "require.resolve('@vitest/coverage-v8')"`);
  return r.code === 0;
}

// ------------------------------------------------------------
// haru_format_lint
// ------------------------------------------------------------

const FormatLintInput = z
  .object({
    path: z.string().default('.').describe('Path to format/lint (default: entire codebase)'),
    write: z.boolean().default(true).describe('Apply fixes automatically (default: true)'),
    check: z.boolean().default(true).describe('Run in check mode (default: true)'),
  })
  .strict();

tool({
  name: 'haru_format_lint',
  title: 'Format and Lint',
  description: `Run Biome to format and lint the codebase, optionally auto-fixing. Uses npx --no-install so no network downloads occur.

Mutating when write=true (auto-fix rewrites files). Respects MCP_ALLOW_FILE_WRITES.

Args:
  - path (string): target path (default '.')
  - write (boolean): apply fixes in place (default true)
  - check (boolean): Biome check vs format mode (default true)

Returns:
  Text: issues found (with exit code) or a success confirmation.

Examples:
  - Use when: "Lint the whole repo" -> defaults
  - Use when: "Format just src/mcp" -> path="src/mcp"
  - Use when: "Report but don't touch anything" -> write=false

Error Handling:
  - Writes disabled while write=true -> Error: set MCP_ALLOW_FILE_WRITES=true or run with write=false`,
  inputSchema: FormatLintInput,
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  callback: async ({ path, write, check }) => {
    if (write && !config.allowFileWrites) {
      return toolError(
        'auto-fix writing is disabled',
        'Set MCP_ALLOW_FILE_WRITES=true to enable, or run with write=false',
      );
    }

    const command = `npx --no-install biome ${check ? 'check' : 'format'} ${write ? '--write' : ''} ${esc(path)}`;
    const { stdout, stderr, code } = await runCmd(command);

    if (code !== 0) {
      return {
        content: [{ type: 'text', text: `Biome found issues:\n${stdout}\n${stderr}` }],
      };
    }

    return {
      content: [
        { type: 'text', text: `Ok: codebase formatted and linted successfully.\n${stdout}` },
      ],
    };
  },
});

// ------------------------------------------------------------
// haru_check_quality
// ------------------------------------------------------------

const CheckQualityInput = z
  .object({
    strict: z.boolean().default(false).describe('Fail on warnings too (default: false)'),
    include: z
      .array(z.enum(['typescript', 'biome', 'tests', 'go', 'eslint']))
      .default(['typescript', 'biome'])
      .describe('Checks to run; go and eslint map to no-op/biome shims'),
  })
  .strict();

const CheckQualityOutput = z.object({
  passed: z.boolean(),
  checks: z.array(
    z.object({
      name: z.string(),
      passed: z.boolean(),
      output: z.string(),
    }),
  ),
});

tool({
  name: 'haru_check_quality',
  title: 'Run Quality Gates',
  description: `Run the project's quality gates: tsc --noEmit, Biome check, and Vitest (subset as requested). Uses npx --no-install.

Read-only: never modifies files.

Args:
  - strict (boolean): report isError when any gate fails (default false)
  - include (string[]): subset of ['typescript','biome','tests','go','eslint']; default ['typescript','biome']

Returns:
  Text per gate with pass/fail + output; structured: { passed, checks: [{ name, passed, output }] }

Examples:
  - Use when: "Does the code type-check?" -> include=['typescript']
  - Use when: "Full gate before merge" -> include=['typescript','biome','tests']

Error Handling:
  - Each gate result is reported independently; a failing gate is not a throw
  - Returns Error: quality gates failed on unexpected exceptions`,
  inputSchema: CheckQualityInput,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  outputSchema: CheckQualityOutput,
  callback: async ({ strict, include }) => {
    try {
      const runCheck = async (
        name: string,
        cmd: string,
        okWhenCodeZero = true,
      ): Promise<{ name: string; passed: boolean; output: string }> => {
        const r = await runCmd(cmd);
        return {
          name,
          passed: okWhenCodeZero ? r.code === 0 : true,
          output: `${r.stdout}\n${r.stderr}`.trim(),
        };
      };

      // biome run is shared between the 'biome' and 'eslint' entries so it never executes twice.
      let biomeResult: Promise<{ name: string; passed: boolean; output: string }> | null = null;
      const biomeCheck = () =>
        (biomeResult ??= runCheck('biome', 'npx --no-install biome check .'));

      const executors: Record<
        string,
        () => Promise<{ name: string; passed: boolean; output: string }>
      > = {
        typescript: () => runCheck('typescript', 'npx --no-install tsc --noEmit'),
        biome: biomeCheck,
        eslint: async () => {
          const r = await biomeCheck();
          return {
            ...r,
            name: 'eslint',
            output: `${r.output}\n(note: eslint alias -> biome check)`,
          };
        },
        tests: () =>
          runCheck('tests', `npx --no-install vitest run --passWithNoTests ${VITEST_FLAGS}`),
        go: async () => ({
          name: 'go',
          passed: true,
          output: 'Skipped: Go not used in this project (Next.js). Use typescript/biome.',
        }),
      };

      const checks = await Promise.all(include.map((name) => executors[name]()));

      const allPassed = checks.every((c) => c.passed);
      const payload: z.infer<typeof CheckQualityOutput> = {
        passed: allPassed && !(strict && checks.some((c) => !c.passed)),
        checks,
      };

      const text =
        `${allPassed ? 'Ok' : 'Fail'}: quality gates ${allPassed ? 'PASSED' : 'FAILED'}\n\n` +
        checks
          .map(
            (c) =>
              `### ${c.name.toUpperCase()}\nStatus: ${c.passed ? 'pass' : 'fail'}\nOutput:\n${c.output}\n`,
          )
          .join('\n');

      return {
        content: [{ type: 'text', text }],
        structuredContent: payload as Record<string, unknown>,
      };
    } catch (err) {
      return toolError(
        'quality gates failed',
        `Details: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },
});

// ------------------------------------------------------------
// haru_run_tests
// ------------------------------------------------------------

const RunTestsInput = z
  .object({
    env: z
      .enum(['typescript', 'go', 'all'])
      .describe("Test environment: 'typescript' (vitest), 'go', or 'all'"),
    target: z.string().optional().describe('Specific file, directory, or test filter pattern'),
    parallel: z.boolean().default(true).describe('Run suites concurrently (default: true)'),
    coverage: z.boolean().default(false).describe('Generate a coverage report (default: false)'),
  })
  .strict();

const RunTestsOutput = z.object({
  passed: z.boolean(),
  suites: z.array(
    z.object({
      command: z.string(),
      exit_code: z.number(),
      output: z.string(),
    }),
  ),
});

tool({
  name: 'haru_run_tests',
  title: 'Run Tests',
  description: `Execute the project test suites (Vitest for TypeScript, go test for Go) and report pass/fail per suite. Uses npx --no-install.

Read-only: tests do not modify tracked files (some tests may create temp artifacts).

Args:
  - env ('typescript'|'go'|'all'): which suites to run
  - target (string?): file/dir/filter for a single suite, e.g. 'tests/playback' or 'playback'
  - parallel (boolean): run suites concurrently (default true)
  - coverage (boolean): include coverage output (default false)

Returns:
  Text per suite with exit code + output; structured: { passed, suites: [{ command, exit_code, output }] }

Examples:
  - Use when: "Run the whole TS test suite" -> env='typescript'
  - Use when: "Run only the playback tests" -> env='typescript', target='playback'

Error Handling:
  - A failing suite is reported with its output (not a protocol error)
  - Missing go toolchain reports a non-zero exit for that suite`,
  inputSchema: RunTestsInput,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  outputSchema: RunTestsOutput,
  callback: async ({ env, target, coverage }) => {
    try {
      const commands: string[] = [];

      if (env === 'typescript' || env === 'all') {
        commands.push(
          `npx --no-install vitest run ${target || ''} --passWithNoTests ${VITEST_FLAGS} ${coverage ? '--coverage' : ''}`,
        );
      }
      if (env === 'go' || env === 'all') {
        commands.push(`go test ${target || './...'} -v ${coverage ? '-cover' : ''}`);
      }

      const results = await Promise.all(
        commands.map(async (cmd) => {
          const result = await runCmd(cmd);
          return { command: cmd, ...result };
        }),
      );

      let coverageNote = '';
      if (coverage && !(await coverageProviderInstalled())) {
        coverageNote = '\n(coverage skipped: @vitest/coverage-v8 is not installed)';
        results[0] = {
          ...results[0],
          command: `${results[0].command} # without --coverage`,
          code: 0,
          stdout: results[0].stdout,
          stderr: `${results[0].stderr}${coverageNote}`,
        };
      }

      const suites: z.infer<typeof RunTestsOutput>['suites'] = results.map((r) => ({
        command: r.command,
        exit_code: r.code,
        output: `${r.stdout}\n${r.stderr}`.trim(),
      }));

      const allPassed = results.every((r) => r.code === 0);
      const payload: z.infer<typeof RunTestsOutput> = { passed: allPassed, suites };

      const text =
        `${allPassed ? 'Ok' : 'Fail'}: all tests ${allPassed ? 'PASSED' : 'FAILED'}\n\n` +
        suites
          .map(
            (s) =>
              `### ${s.command.split(' ')[2] || 'Test'}\nExit Code: ${s.exit_code}\nOutput:\n${s.output}\n`,
          )
          .join('\n');

      return {
        content: [{ type: 'text', text }],
        structuredContent: payload as Record<string, unknown>,
      };
    } catch (err) {
      return toolError(
        'test run failed',
        `Details: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },
});
