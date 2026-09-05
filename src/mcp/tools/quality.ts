import { z } from 'zod';
import { config } from '../config.js';
import { okStructured, okText, tool, toolError } from '../server.js';
import { READ_ONLY } from '../types.js';
import { esc, hasModule, runCmd } from '../utils/exec.js';

const VITEST_FLAGS = '--reporter=dot --silent';
const LONG_CMD_TIMEOUT = 60_000;

// ---------- haru_format_lint ----------

const FormatLintInput = z
  .object({
    path: z.string().default('.').describe('Path to format/lint (default: entire codebase)'),
    write: z.boolean().default(true).describe('Apply fixes automatically (default true)'),
    check: z.boolean().default(true).describe('Run biome in `check` mode (default true)'),
  })
  .strict();

tool({
  name: 'haru_format_lint',
  title: 'Format and Lint',
  description: `Run Biome to format and lint the codebase, optionally auto-fixing. Uses npx --no-install so no network downloads occur.

Mutating when write=true (auto-fix rewrites files). Respects MCP_ALLOW_FILE_WRITES.

Args:
  - path (string, default '.')
  - write (bool, default true)
  - check (bool, default true) — when true runs \`biome check\`, else \`biome format\``,
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
        'Set MCP_ALLOW_FILE_WRITES=true to enable, or pass write=false.',
      );
    }
    const sub = check ? 'check' : 'format';
    const writeFlag = write ? '--write' : '';
    const cmd = `npx --no-install biome ${sub} ${writeFlag} ${esc(path)}`
      .replace(/\s+/g, ' ')
      .trim();
    const r = await runCmd(cmd, { timeout: LONG_CMD_TIMEOUT });
    if (r.code === 0) {
      return okText(`Ok: biome ${sub} passed.\n${r.stdout}`);
    }
    return okText(`Biome ${sub} found issues:\n${r.stdout}\n${r.stderr}`);
  },
});

// ---------- haru_check_quality ----------

const CheckQualityInput = z
  .object({
    strict: z.boolean().default(false).describe('Fail on warnings too (default false)'),
    include: z
      .array(z.enum(['typescript', 'biome', 'tests', 'go', 'eslint']))
      .default(['typescript', 'biome'])
      .describe('Checks to run (go and eslint are shims in this project)'),
  })
  .strict();

const CheckQualityOutput = z.object({
  passed: z.boolean(),
  strict: z.boolean(),
  checks: z.array(z.object({ name: z.string(), passed: z.boolean(), output: z.string() })),
});

tool({
  name: 'haru_check_quality',
  title: 'Run Quality Gates',
  description: `Run the project's quality gates: \`tsc --noEmit\`, biome check, vitest. Gates run serially to keep peak memory low on laptops.

Args:
  - strict (bool, default false) — when true, any warning fails the gate
  - include (array, default ['typescript','biome']) — pick which gates to run

Returns: { passed, strict, checks: [{ name, passed, output }] }`,
  inputSchema: CheckQualityInput,
  annotations: READ_ONLY,
  outputSchema: CheckQualityOutput,
  callback: async ({ strict, include }) => {
    const runOne = async (name: string, cmd: string, timeout = LONG_CMD_TIMEOUT) => {
      const r = await runCmd(cmd, { timeout });
      return { name, passed: r.code === 0, output: `${r.stdout}\n${r.stderr}`.trim() };
    };

    const biomeOnce = () => runOne('biome', 'npx --no-install biome check .');

    const executors: Record<
      string,
      () => Promise<{ name: string; passed: boolean; output: string }>
    > = {
      typescript: () => runOne('typescript', 'npx --no-install tsc --noEmit'),
      biome: biomeOnce,
      eslint: async () => {
        const r = await biomeOnce();
        return { ...r, name: 'eslint', output: `${r.output}\n(note: eslint is aliased to biome)` };
      },
      tests: () => runOne('tests', `npx --no-install vitest run --passWithNoTests ${VITEST_FLAGS}`),
      go: async () => ({
        name: 'go',
        passed: true,
        output: 'Skipped: Go is not used in this project (Next.js). Use typescript/biome.',
      }),
    };

    const checks: { name: string; passed: boolean; output: string }[] = [];
    for (const name of include) {
      const exec = executors[name];
      if (!exec) {
        checks.push({ name, passed: false, output: `Unknown check '${name}'` });
        continue;
      }
      checks.push(await exec());
    }

    // Strict mode: a "warning" output (anything containing 'warning' but not 'error') flips a passed check to failed.
    if (strict) {
      for (const c of checks) {
        if (c.passed && /warning/i.test(c.output) && !/error/i.test(c.output)) {
          c.passed = false;
          c.output += '\n(strict mode: warnings are failures)';
        }
      }
    }

    const allPassed = checks.every((c) => c.passed);
    const payload: z.infer<typeof CheckQualityOutput> = { passed: allPassed, strict, checks };
    const text =
      `${allPassed ? 'Ok' : 'Fail'}: quality gates ${allPassed ? 'PASSED' : 'FAILED'} (strict=${strict})\n\n` +
      checks
        .map(
          (c) =>
            `### ${c.name.toUpperCase()}\nStatus: ${c.passed ? 'pass' : 'fail'}\nOutput:\n${c.output}\n`,
        )
        .join('\n');
    return okStructured(payload, text);
  },
});

// ---------- haru_run_tests ----------

const RunTestsInput = z
  .object({
    env: z.enum(['typescript', 'go', 'all']).describe("'typescript' (vitest), 'go', or 'all'"),
    target: z.string().optional().describe('Specific file, directory, or vitest filter pattern'),
    parallel: z.boolean().default(true).describe('Run suites concurrently (default true)'),
    coverage: z.boolean().default(false).describe('Generate coverage report (default false)'),
  })
  .strict();

const RunTestsOutput = z.object({
  passed: z.boolean(),
  suites: z.array(z.object({ command: z.string(), exit_code: z.number(), output: z.string() })),
});

tool({
  name: 'haru_run_tests',
  title: 'Run Tests',
  description: `Execute the project test suites (vitest for TypeScript, \`go test\` for Go).

Args:
  - env ('typescript' | 'go' | 'all')
  - target (string?): specific file, dir, or vitest pattern
  - parallel (bool, default true)
  - coverage (bool, default false)

Returns: { passed, suites: [{ command, exit_code, output }] }`,
  inputSchema: RunTestsInput,
  annotations: READ_ONLY,
  outputSchema: RunTestsOutput,
  callback: async ({ env, target, parallel, coverage }) => {
    const commands: string[] = [];
    if (env === 'typescript' || env === 'all') {
      const t = target ? esc(target) : '';
      commands.push(
        `npx --no-install vitest run ${t} --passWithNoTests ${VITEST_FLAGS} ${coverage ? '--coverage' : ''}`.trim(),
      );
    }
    if (env === 'go' || env === 'all') {
      const t = target ? esc(target) : './...';
      commands.push(`go test ${t} -v ${coverage ? '-cover' : ''}`.trim());
    }
    if (commands.length === 0) {
      return okText('No suites selected.');
    }

    const runOne = async (cmd: string) => ({
      command: cmd,
      ...(await runCmd(cmd, { timeout: 120_000 })),
    });

    const results = parallel
      ? await Promise.all(commands.map(runOne))
      : await (async () => {
          const out: Awaited<ReturnType<typeof runOne>>[] = [];
          for (const cmd of commands) out.push(await runOne(cmd));
          return out;
        })();

    if (coverage && !(await hasModule('@vitest/coverage-v8'))) {
      const note = '\n(coverage skipped: @vitest/coverage-v8 not installed)';
      const first = results[0];
      if (first) {
        first.command = `${first.command} # without --coverage`;
        first.stderr = `${first.stderr}${note}`;
      }
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
            `### ${s.command.split(' ').slice(0, 3).join(' ')}\nExit Code: ${s.exit_code}\nOutput:\n${s.output}\n`,
        )
        .join('\n');
    return okStructured(payload, text);
  },
});
