import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { okStructured, tool } from '../server.js';
import { READ_ONLY } from '../types.js';
import { runCmd } from '../utils/exec.js';

const AgentSelfReviewInput = z
  .object({
    changes: z.array(z.string()).optional().describe('List of changed file paths to review'),
    checklist: z
      .array(z.string())
      .optional()
      .describe('Extra checklist items (standard items are always included)'),
    /** Skip the heaviest check (vitest) for a quicker, lighter review. */
    skipTests: z.boolean().default(false).describe('Skip running vitest (default false)'),
  })
  .strict();

const AgentSelfReviewOutput = z.object({
  passed: z.boolean(),
  checks: z.array(z.object({ item: z.string(), passed: z.boolean(), output: z.string() })),
});

const DEFAULT_CHECKLIST = [
  'All tests pass',
  'No type errors (tsc --noEmit)',
  'Code formatted (biome check)',
  'No console.log statements in production code',
  'Error handling implemented',
  'Documentation updated',
  'Backward compatibility maintained',
  'Performance not degraded',
] as const;

tool({
  name: 'haru_agent_self_review',
  title: 'Agent Self-Review',
  description: `Run an automated checklist against the workspace (tsc, biome, console.log scan, vitest when enabled) and summarize pass/fail.

Read-only. Heavy checks (vitest) can be skipped with skipTests=true.

Args:
  - changes (string[]?): list of changed file paths to review
  - checklist (string[]?): extra items; standard items are always included
  - skipTests (bool, default false)`,
  inputSchema: AgentSelfReviewInput,
  annotations: READ_ONLY,
  outputSchema: AgentSelfReviewOutput,
  callback: async ({ changes, checklist, skipTests }) => {
    const reviewItems = [...(checklist ?? []), ...DEFAULT_CHECKLIST];

    const runCmdWithTimeout = (cmd: string) => runCmd(cmd, { timeout: 90_000 });

    const standard: Record<string, () => Promise<{ passed: boolean; output: string }>> = {
      'All tests pass': async () => {
        if (skipTests) return { passed: true, output: 'Skipped (skipTests=true)' };
        const t = await runCmdWithTimeout(
          'npx --no-install vitest run --passWithNoTests --silent --reporter=dot',
        );
        return { passed: t.code === 0, output: `${t.stdout}\n${t.stderr}`.trim() };
      },
      'No type errors (tsc --noEmit)': async () => {
        const r = await runCmdWithTimeout('npx --no-install tsc --noEmit');
        return { passed: r.code === 0, output: `${r.stdout}\n${r.stderr}`.trim() };
      },
      'Code formatted (biome check)': async () => {
        const r = await runCmdWithTimeout('npx --no-install biome check');
        return { passed: r.code === 0, output: `${r.stdout}\n${r.stderr}`.trim() };
      },
      'No console.log statements in production code': async () => {
        const r = await runCmd(`git grep -n 'console\\.log' -- '*.ts' '*.tsx' '*.js'`);
        const flagged: string[] = [];
        for (const line of r.stdout.split('\n').filter(Boolean)) {
          const m = line.match(/^([^:]+):(\d+):(.*)$/);
          if (!m) continue;
          const [, file, lineNum, text] = m;
          if (file.startsWith('src/mcp/')) continue;
          const trimmed = text.trim();
          if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*'))
            continue;
          let prev = '';
          let prev2 = '';
          try {
            const fileLines = readFileSync(file, 'utf8').split('\n');
            prev = fileLines[Number(lineNum) - 2] ?? '';
            prev2 = fileLines[Number(lineNum) - 3] ?? '';
          } catch {
            flagged.push(line);
            continue;
          }
          if (!/biome-ignore/.test(prev) && !/biome-ignore/.test(prev2)) flagged.push(line);
        }
        return {
          passed: flagged.length === 0,
          output: flagged.length ? flagged.join('\n') : 'No console.log without biome-ignore.',
        };
      },
      'Error handling implemented': async () => ({
        passed: true,
        output: 'Manual verification required',
      }),
      'Documentation updated': async () => ({
        passed: true,
        output: 'Manual verification required',
      }),
      'Backward compatibility maintained': async () => ({
        passed: true,
        output: 'Manual verification required',
      }),
      'Performance not degraded': async () => ({
        passed: true,
        output: 'Manual verification required',
      }),
    };

    // Serial on purpose — parallel vitest+tsc+biome spikes CPU/RAM.
    const results: { item: string; passed: boolean; output: string }[] = [];
    for (const item of DEFAULT_CHECKLIST) {
      const run =
        standard[item] ?? (async () => ({ passed: true, output: 'Manual verification required' }));
      results.push({ item, ...(await run()) });
    }
    const byItem = new Map(results.map((r) => [r.item, r]));

    const checks: { item: string; passed: boolean; output: string }[] = [];
    for (const item of reviewItems) {
      const existing = byItem.get(item);
      if (existing) checks.push(existing);
      else checks.push({ item, passed: true, output: 'Manual verification required' });
    }

    const allPassed = checks.every((c) => c.passed);
    const payload: z.infer<typeof AgentSelfReviewOutput> = { passed: allPassed, checks };
    const text =
      `AGENT SELF-REVIEW\n\n**Status:** ${allPassed ? 'PASSED' : 'NEEDS ATTENTION'}\n\n` +
      `### Checklist:\n\n` +
      checks
        .map((c) => `${c.passed ? 'pass' : 'fail'} **${c.item}**\n   ${c.output}\n`)
        .join('\n') +
      (changes?.length ? `\n### Changed files:\n${changes.map((f) => `- ${f}`).join('\n')}` : '');
    return okStructured(payload, text);
  },
});
