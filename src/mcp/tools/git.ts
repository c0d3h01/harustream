import { z } from 'zod';
import { okText, tool, toolError } from '../server.js';
import { READ_OPEN_WORLD } from '../types.js';
import { runCmd } from '../utils/exec.js';

const ReviewChangesInput = z
  .object({
    format: z.enum(['unified', 'side-by-side', 'json']).default('unified').describe('Diff format'),
    includeStats: z.boolean().default(true).describe('Include change statistics (default true)'),
  })
  .strict();

tool({
  name: 'haru_review_changes',
  title: 'Review Pending Changes',
  description: `Inspect uncommitted git changes (modified + untracked) with optional diff statistics.

Read-only.

Args:
  - format ('unified' | 'side-by-side' | 'json', default 'unified')
  - includeStats (bool, default true)

Returns: human-readable diff or JSON blob with { diff, stats, numstat, files, untracked }`,
  inputSchema: ReviewChangesInput,
  annotations: READ_OPEN_WORLD,
  callback: async ({ format, includeStats }) => {
    try {
      const diffCmd = format === 'side-by-side' ? 'git diff HEAD --color-words' : 'git diff HEAD';
      const [diff, untracked] = await Promise.all([
        runCmd(diffCmd),
        runCmd('git ls-files --others --exclude-standard'),
      ]);

      const hasChanges = diff.stdout.trim() || untracked.stdout.trim();
      if (!hasChanges) {
        return okText(`No pending changes tracked by Git.\n${diff.stderr}`);
      }

      if (format === 'json') {
        const [stats, numstat, nameOnly] = await Promise.all([
          runCmd('git diff HEAD --stat'),
          runCmd('git diff HEAD --numstat'),
          runCmd('git diff HEAD --name-only'),
        ]);
        const untrackedFiles = untracked.stdout.split('\n').filter(Boolean);
        const allFiles = [...nameOnly.stdout.split('\n').filter(Boolean), ...untrackedFiles];
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  diff: diff.stdout,
                  stats: stats.stdout,
                  numstat: numstat.stdout,
                  files: allFiles,
                  untracked: untrackedFiles,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      let result = diff.stdout;
      if (untracked.stdout.trim()) result += `\n\n=== UNTRACKED FILES ===\n${untracked.stdout}`;
      if (includeStats) {
        const stats = await runCmd('git diff HEAD --stat');
        let block = stats.stdout;
        if (untracked.stdout.trim()) {
          const extra = untracked.stdout
            .split('\n')
            .filter(Boolean)
            .map((f) => ` ${f} | untracked`)
            .join('\n');
          block += `\n${extra}`;
        }
        result = `=== CHANGE STATISTICS ===\n${block}\n\n=== DIFF ===\n${result}`;
      }
      return okText(result);
    } catch (err) {
      return toolError(
        'failed to review pending changes',
        `Details: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },
});
