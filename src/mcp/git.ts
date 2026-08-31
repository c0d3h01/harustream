import { z } from 'zod';
import { runCmd, tool, toolError } from './core.js';

// ============================================
// GIT TOOLS
// ============================================

const ReviewChangesInput = z
  .object({
    format: z
      .enum(['unified', 'side-by-side', 'json'])
      .default('unified')
      .describe('Diff format (default: unified)'),
    includeStats: z.boolean().default(true).describe('Include change statistics (default: true)'),
  })
  .strict();

tool({
  name: 'haru_review_changes',
  title: 'Review Pending Changes',
  description: `Review pending worktree changes with diff statistics and a formatted diff (unified, side-by-side, or json).

Read-only: only reads git state.

Args:
  - format ('unified'|'side-by-side'|'json'): diff presentation (default 'unified')
  - includeStats (boolean): prepend git diff --stat (default true; forced for json)

Returns:
  Text: change statistics followed by the diff; json mode wraps diff/stat/numstat/files in a single JSON object.

Examples:
  - Use when: "What did I change so far?" -> defaults
  - Use when: "Show me the pending changes as JSON" -> format='json'

Error Handling:
  - No pending changes -> "No pending changes tracked by Git."
  - Not a repository -> Error surfaced from git`,
  inputSchema: ReviewChangesInput,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  callback: async ({ format, includeStats }) => {
    try {
      const diffCmd = format === 'side-by-side' ? 'git diff --color-words' : 'git diff';
      const { stdout, stderr } = await runCmd(diffCmd);

      if (!stdout.trim()) {
        return {
          content: [{ type: 'text', text: `No pending changes tracked by Git.\n${stderr}` }],
        };
      }

      if (format === 'json') {
        const [stats, numstat, nameOnly] = await Promise.all([
          runCmd('git diff --stat'),
          runCmd('git diff --numstat'),
          runCmd('git diff --name-only'),
        ]);
        const jsonResult = JSON.stringify(
          {
            diff: stdout,
            stats: stats.stdout,
            numstat: numstat.stdout,
            files: nameOnly.stdout.split('\n').filter(Boolean),
          },
          null,
          2,
        );
        return { content: [{ type: 'text', text: jsonResult }] };
      }

      let result = stdout;
      if (includeStats) {
        const stats = await runCmd('git diff --stat');
        result = `=== CHANGE STATISTICS ===\n${stats.stdout}\n\n=== DIFF ===\n${result}`;
      }

      return { content: [{ type: 'text', text: result }] };
    } catch (err) {
      return toolError(
        'failed to review pending changes',
        `Details: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },
});
