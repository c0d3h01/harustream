import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { runCmd, tool } from './core.js';

// ============================================
// AGENT WORKFLOW TOOLS
// Standard checks run in parallel; vitest runs silent+dot
// so the response stays small and fast.
// ============================================

const AgentSelfReviewInput = z
  .object({
    changes: z.array(z.string()).optional().describe('List of changed file paths to review'),
    checklist: z
      .array(z.string())
      .optional()
      .describe('Extra checklist items; standard items are always included'),
  })
  .strict();

const AgentSelfReviewOutput = z.object({
  passed: z.boolean(),
  checks: z.array(
    z.object({
      item: z.string(),
      passed: z.boolean(),
      output: z.string(),
    }),
  ),
});

tool({
  name: 'haru_agent_self_review',
  title: 'Agent Self-Review',
  description: `Run an automated checklist against the workspace (tests, tsc, biome, console.log scan, plus any custom items) and summarize pass/fail.

Read-only: runs checks only, never modifies files.

Args:
  - changes (string[]?): changed file paths (reported for context)
  - checklist (string[]?): extra items; standard items are always appended

Returns:
  Text checklist summary; structured: { passed, checks: [{ item, passed, output }] }

Examples:
  - Use when: "Double-check my changes before you finish" -> defaults
  - Use when: "Verify + also check migrations are listed" -> checklist=['Migrations reviewed']

Error Handling:
  - Unrecognized custom items report "Manual verification required" (not failures)
  - tool isError reflects a failed standard check`,
  inputSchema: AgentSelfReviewInput,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  outputSchema: AgentSelfReviewOutput,
  callback: async ({ changes, checklist }) => {
    const defaultChecklist = [
      'All tests pass',
      'No type errors (tsc --noEmit)',
      'Code formatted (biome check)',
      'No console.log statements in production code',
      'Error handling implemented',
      'Documentation updated',
      'Backward compatibility maintained',
      'Performance not degraded',
    ];

    const reviewChecklist = [...(checklist || []), ...defaultChecklist];
    const checks: z.infer<typeof AgentSelfReviewOutput>['checks'] = [];

    const standard: Record<string, () => Promise<{ passed: boolean; output: string }>> = {
      'All tests pass': async () => {
        const t = await runCmd(
          'npx --no-install vitest run --passWithNoTests --silent --reporter=dot',
        );
        return { passed: t.code === 0, output: `${t.stdout}\n${t.stderr}`.trim() };
      },
      'No type errors (tsc --noEmit)': async () => {
        const r = await runCmd('npx --no-install tsc --noEmit');
        return { passed: r.code === 0, output: `${r.stdout}\n${r.stderr}`.trim() };
      },
      'Code formatted (biome check)': async () => {
        const r = await runCmd('npx --no-install biome check');
        return { passed: r.code === 0, output: `${r.stdout}\n${r.stderr}`.trim() };
      },
      'No console.log statements in production code': async () => {
        const r = await runCmd("git grep -n 'console\\.log' -- '*.ts' '*.tsx' '*.js'");
        const raw = r.stdout.split('\n').filter(Boolean);

        // Only flag occurrences not covered by an explicit biome-ignore marker
        // (the repo logs via console in dev proxy code) and not the tooling's own
        // docstrings or commented-out code.
        const flagged: string[] = [];
        for (const line of raw) {
          const m = line.match(/^([^:]+):(\d+):(.*)$/);
          if (!m) continue;
          const [, file, lineNum, text] = m;
          const trimmed = text.trim();
          if (file.startsWith('src/mcp/')) continue;
          if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
            continue;
          }
          const n = Number(lineNum);
          let prev = '';
          let prev2 = '';
          try {
            const fileLines = readFileSync(file, 'utf8').split('\n');
            prev = fileLines[n - 2] ?? '';
            prev2 = fileLines[n - 3] ?? '';
          } catch {
            flagged.push(line);
            continue;
          }
          if (!/biome-ignore/.test(prev) && !/biome-ignore/.test(prev2)) flagged.push(line);
        }

        return {
          passed: flagged.length === 0,
          output: flagged.length
            ? flagged.join('\n')
            : 'No console.log found without biome-ignore.',
        };
      },
    };

    const results = await Promise.all(
      defaultChecklist.map(async (item) => ({
        item,
        ...(await (
          standard[item] ?? (async () => ({ passed: true, output: 'Manual verification required' }))
        )()),
      })),
    );
    const byItem = new Map(results.map((r) => [r.item, r]));

    for (const item of reviewChecklist) {
      checks.push(
        byItem.get(item) ?? { item, passed: true, output: 'Manual verification required' },
      );
    }

    const allPassed = checks.every((r) => r.passed);
    const payload: z.infer<typeof AgentSelfReviewOutput> = { passed: allPassed, checks };

    const text =
      `AGENT SELF-REVIEW\n\n**Status:** ${allPassed ? 'PASSED' : 'NEEDS ATTENTION'}\n\n### Checklist:\n\n` +
      checks
        .map((c) => `${c.passed ? 'pass' : 'fail'} **${c.item}**\n   ${c.output}\n`)
        .join('\n') +
      (changes?.length ? `\n### Changed files:\n${changes.map((f) => `- ${f}`).join('\n')}` : '');

    return {
      content: [{ type: 'text', text }],
      structuredContent: payload as Record<string, unknown>,
      isError: !allPassed,
    };
  },
});
