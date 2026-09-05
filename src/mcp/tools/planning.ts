import { z } from 'zod';
import { okStructured, okText, tool, toolError } from '../server.js';
import { READ_ONLY } from '../types.js';
import { runCmd } from '../utils/exec.js';

/** Cheap file count using git ls-files — avoids scanning the whole repo. */
async function countFiles(scope: string[]): Promise<number> {
  if (scope.length === 0) {
    const r = await runCmd('git ls-files');
    return r.stdout.split('\n').filter(Boolean).length;
  }
  const r = await runCmd(
    `git ls-files ${scope.map((s) => `'${s.replace(/'/g, "'\\''")}'`).join(' ')}`,
  );
  return r.stdout.split('\n').filter(Boolean).length;
}

function estimateComplexity(n: number): string {
  if (n > 200) return 'High';
  if (n > 50) return 'Medium';
  return 'Low';
}

// ---------- haru_plan_build ----------

const PlanBuildInput = z
  .object({
    taskDescription: z.string().min(1).max(4000).describe('High-level task description'),
    scope: z
      .array(z.string())
      .default([])
      .describe('Specific files/dirs to focus on; empty = whole repo'),
  })
  .strict();

tool({
  name: 'haru_plan_build',
  title: 'Generate Build Plan',
  description: `Produce a multi-phase implementation plan for a task: complexity estimate, phases, risks, and recommended tools.

Read-only. Fast: uses \`git ls-files\` for size estimates, not a full re-read of the repo.

Args:
  - taskDescription (string)
  - scope (string[], default [])`,
  inputSchema: PlanBuildInput,
  annotations: READ_ONLY,
  callback: async ({ taskDescription, scope }) => {
    try {
      const fileCount = await countFiles(scope);
      const complexity = estimateComplexity(fileCount);
      const phases = [
        {
          name: 'Analysis Phase',
          steps: [
            'Review relevant files and their dependencies',
            'Identify existing patterns and conventions',
            'Map out data flow and interfaces',
          ],
          estimatedTime: '10-30 minutes',
        },
        {
          name: 'Implementation Phase',
          steps: [
            'Modify the relevant files (use haru_edit_file / haru_write_file for atomic changes)',
            'Update or extend existing modules rather than introducing parallel ones',
            'Run haru_check_quality after each non-trivial change',
          ],
          estimatedTime: '1-4 hours',
        },
        {
          name: 'Validation Phase',
          steps: [
            'haru_check_quality include=typescript',
            'haru_format_lint write=false',
            'haru_run_tests env=typescript',
            'haru_review_changes to inspect the final diff',
          ],
          estimatedTime: '30-60 minutes',
        },
      ];
      const risks = [
        'Breaking existing functionality if interfaces change',
        'Performance regression if new code is not measured',
        'Type errors if TypeScript definitions are out of date',
      ];
      const recommendations = [
        'Use haru_search_codebase before each edit to find every usage of the symbols you touch',
        'Run haru_check_quality after every meaningful change',
        'Prefer haru_read_file with line windows over haru_read_codebase for targeted context',
      ];
      const text =
        `BUILD PLAN: ${taskDescription}\n\n` +
        `**Complexity:** ${complexity}\n` +
        `**Files in scope:** ${fileCount}\n\n` +
        `### Phases:\n\n` +
        phases
          .map(
            (p) =>
              `**${p.name}**\n${p.steps.map((s) => `- ${s}`).join('\n')}\n*Estimated: ${p.estimatedTime}*\n`,
          )
          .join('\n\n') +
        `\n### Risks:\n${risks.map((r) => `- ${r}`).join('\n')}\n\n` +
        `### Recommendations:\n${recommendations.map((r) => `- ${r}`).join('\n')}`;
      return okText(text);
    } catch (err) {
      return toolError(
        'failed to generate build plan',
        `Details: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },
});

// ---------- haru_plan_task ----------

const PlanTaskInput = z
  .object({
    task: z.string().min(1).max(4000).describe('High-level task description'),
    context: z.string().optional().describe('Additional context or requirements'),
    urgency: z
      .enum(['low', 'medium', 'high', 'critical'])
      .default('medium')
      .describe('Task urgency'),
  })
  .strict();

const PlanTaskOutput = z.object({
  task: z.string(),
  urgency: z.enum(['low', 'medium', 'high', 'critical']),
  step_count: z.number(),
  steps: z.array(z.string()),
  estimated_time_minutes: z.number(),
});

tool({
  name: 'haru_plan_task',
  title: 'Plan Agent Task',
  description: `Create a detailed, multi-step execution plan for an AI agent with tool recommendations, dependencies, and risk mitigation.

Read-only.

Args:
  - task (string)
  - context (string?)
  - urgency ('low' | 'medium' | 'high' | 'critical', default 'medium')`,
  inputSchema: PlanTaskInput,
  annotations: READ_ONLY,
  outputSchema: PlanTaskOutput,
  callback: async ({ task, context, urgency }) => {
    const steps = [
      {
        id: 1,
        description: 'Analyze codebase structure and dependencies',
        tools: ['haru_read_file', 'haru_plan_build'],
      },
      {
        id: 2,
        description: 'Identify files and functions to modify',
        tools: ['haru_smart_search', 'haru_get_file_signatures'],
      },
      { id: 3, description: 'Generate a focused build plan', tools: ['haru_plan_build'] },
      {
        id: 4,
        description: 'Implement changes with atomic edits',
        tools: ['haru_edit_file', 'haru_write_file'],
      },
      {
        id: 5,
        description: 'Run quality gates and tests',
        tools: ['haru_check_quality', 'haru_run_tests'],
      },
      {
        id: 6,
        description: 'Review changes and create summary',
        tools: ['haru_review_changes', 'haru_get_logs'],
      },
    ];
    const payload: z.infer<typeof PlanTaskOutput> = {
      task,
      urgency,
      step_count: steps.length,
      steps: steps.map((s) => s.description),
      estimated_time_minutes: urgency === 'critical' ? 60 : urgency === 'high' ? 90 : 180,
    };
    const text =
      `AGENT TASK PLAN: ${task}\n` +
      `**Urgency:** ${urgency.toUpperCase()}\n` +
      `**Context:** ${context || 'None'}\n\n` +
      `### Execution Steps:\n\n` +
      steps
        .map(
          (s) => `#### Step ${s.id}: ${s.description}\n` + `- **Tools:** ${s.tools.join(', ')}\n`,
        )
        .join('\n') +
      `\n### Dependencies:\n${steps
        .slice(1)
        .map((s) => `- Step ${s.id} depends on step ${s.id - 1}`)
        .join('\n')}\n\n` +
      `### Risk Mitigation:\n` +
      `- Use haru_edit_file with backups enabled (backup=true)\n` +
      `- Validate after each major change with haru_check_quality\n` +
      `- Review the full diff with haru_review_changes before finishing\n\n` +
      `### Success Criteria:\n` +
      `- All tests pass\n- No type errors\n- Code formatted and linted\n- Performance not degraded`;
    return okStructured(payload, text);
  },
});
