import * as path from 'node:path';
import { z } from 'zod';
import { buildDependencyGraph, tool, toolError } from './core.js';

// ============================================
// PLANNING TOOLS
// ============================================

// ------------------------------------------------------------
// haru_plan_build
// ------------------------------------------------------------

const PlanBuildInput = z
  .object({
    taskDescription: z
      .string()
      .min(1)
      .max(4000)
      .describe('Description of the task or feature to implement'),
    scope: z
      .array(z.string())
      .default([])
      .describe('Specific files/dirs to focus on; empty = whole codebase'),
  })
  .strict();

tool({
  name: 'haru_plan_build',
  title: 'Generate Build Plan',
  description: `Analyze the codebase dependency graph and produce a multi-phase implementation plan for a feature/task, including complexity estimate, phases, risks, and recommended files to modify.

Read-only.

Args:
  - taskDescription (string): the feature/task to plan
  - scope (string[]): subset of files/dirs to focus the plan on (default [] = entire codebase)

Returns:
  Text build plan (complexity, phases, risks, recommendations, files to modify).

Examples:
  - Use when: "Plan the implementation of a caching layer" -> taskDescription="Add an in-memory cache in front of getMovieInfo", scope=["src/providers"]
  - Use when: "Kick off a fragile refactor carefully" -> defaults

Error Handling:
  - Returns Error: failed to generate build plan if the dependency graph cannot be computed`,
  inputSchema: PlanBuildInput,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  callback: async ({ taskDescription, scope }) => {
    try {
      const codebase = await buildDependencyGraph();
      const allFiles = Object.keys(codebase.files);

      const relevantFiles = scope.length
        ? allFiles.filter((f) => scope.some((s) => f.includes(s)))
        : allFiles;

      const plan = {
        task: taskDescription,
        timestamp: new Date().toISOString(),
        analysis: {
          totalFiles: relevantFiles.length,
          languages: Array.from(new Set(relevantFiles.map((f) => path.extname(f).substring(1)))),
          estimatedComplexity:
            relevantFiles.length > 50 ? 'High' : relevantFiles.length > 20 ? 'Medium' : 'Low',
        },
        phases: [
          {
            name: 'Analysis Phase',
            steps: [
              'Review all relevant files and their dependencies',
              'Identify existing patterns and conventions',
              'Map out data flow and interfaces',
            ],
            estimatedTime: '10-30 minutes',
          },
          {
            name: 'Implementation Phase',
            steps: relevantFiles
              .slice(0, 10)
              .map((f) =>
                f.endsWith('.ts')
                  ? `Modify ${f} (verify imports via haru_get_file_signatures)`
                  : `Modify ${f}`,
              ),
            estimatedTime: '1-4 hours',
          },
          {
            name: 'Validation Phase',
            steps: [
              'Run type checking (haru_check_quality include=typescript)',
              'Execute linter (haru_format_lint write=false)',
              'Run all tests (haru_run_tests)',
              'Verify build passes',
            ],
            estimatedTime: '30-60 minutes',
          },
        ],
        risks: [
          'Breaking existing functionality if interfaces change',
          'Performance degradation if not optimized',
          'Type errors if TypeScript definitions are incorrect',
        ],
        recommendations: [
          'Use haru_read_codebase for full context before changes',
          'Run haru_smart_search to find all usages of modified symbols',
          'Validate with haru_check_quality after each major change',
        ],
        filesToModify: relevantFiles.slice(0, 20),
        dependencies: codebase.files,
      };

      return {
        content: [
          {
            type: 'text',
            text:
              `BUILD PLAN: ${taskDescription}\n\n` +
              `**Complexity:** ${plan.analysis.estimatedComplexity}\n` +
              `**Files to Analyze:** ${plan.analysis.totalFiles}\n\n` +
              `### Phases:\n\n` +
              plan.phases
                .map(
                  (phase) =>
                    `**${phase.name}**\n` +
                    phase.steps.map((step) => `- ${step}`).join('\n') +
                    `\n*Estimated: ${phase.estimatedTime}*\n`,
                )
                .join('\n\n') +
              `\n### Risks:\n` +
              plan.risks.map((risk) => `- ${risk}`).join('\n') +
              `\n\n### Recommendations:\n` +
              plan.recommendations.map((rec) => `- ${rec}`).join('\n'),
          },
        ],
      };
    } catch (err) {
      return toolError(
        'failed to generate build plan',
        `Details: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },
});

// ------------------------------------------------------------
// haru_plan_task
// ------------------------------------------------------------

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
  description: `Create a detailed, multi-step execution plan for an AI agent: analysis, implementation, validation, and review phases with tool recommendations, dependencies, risk mitigation, and success criteria.

Read-only.

Args:
  - task (string): the high-level task
  - context (string?): extra requirements
  - urgency ('low'|'medium'|'high'|'critical'): default 'medium'

Returns:
  Text execution plan; structured: { task, urgency, step_count, steps, estimated_time_minutes }

Examples:
  - Use when: "Plan how I should refactor the providers layer" -> task='Refactor providers layer', context='keep types stable'
  - Use when: "Give me a step-by-step for adding a new provider" -> task='Add new provider source'

Error Handling:
  - Always returns a plan; invalid params are rejected by input validation with a clear message`,
  inputSchema: PlanTaskInput,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  outputSchema: PlanTaskOutput,
  callback: async ({ task, context, urgency }) => {
    const steps = [
      {
        id: 1,
        description: 'Analyze codebase structure and dependencies',
        tools: ['haru_read_codebase', 'haru_plan_build'],
        estimatedTime: '15-30 minutes',
      },
      {
        id: 2,
        description: 'Identify files and functions to modify',
        tools: ['haru_smart_search', 'haru_get_file_signatures'],
        estimatedTime: '10-20 minutes',
      },
      {
        id: 3,
        description: 'Generate build plan',
        tools: ['haru_plan_build'],
        estimatedTime: '5-10 minutes',
      },
      {
        id: 4,
        description: 'Implement changes with atomic edits',
        tools: ['haru_edit_file', 'haru_refactor_codebase'],
        estimatedTime: '1-4 hours',
      },
      {
        id: 5,
        description: 'Run quality gates and tests',
        tools: ['haru_check_quality', 'haru_run_tests'],
        estimatedTime: '30-60 minutes',
      },
      {
        id: 6,
        description: 'Review changes and create summary',
        tools: ['haru_review_changes', 'haru_get_logs'],
        estimatedTime: '15-30 minutes',
      },
    ];

    const payload: z.infer<typeof PlanTaskOutput> = {
      task,
      urgency,
      step_count: steps.length,
      steps: steps.map((s) => s.description),
      estimated_time_minutes: urgency === 'critical' ? 60 : urgency === 'high' ? 90 : 180,
    };

    return {
      content: [
        {
          type: 'text',
          text:
            `AGENT TASK PLAN: ${task}\n` +
            `**Urgency:** ${urgency.toUpperCase()}\n` +
            `**Context:** ${context || 'None'}\n\n` +
            `### Execution Steps:\n\n` +
            steps
              .map(
                (step) =>
                  `#### Step ${step.id}: ${step.description}\n` +
                  `- **Tools:** ${step.tools.join(', ')}\n` +
                  `- **Estimated Time:** ${step.estimatedTime}\n`,
              )
              .join('\n') +
            `\n### Dependencies:\n` +
            steps
              .slice(1)
              .map((s) => `- Step ${s.id} depends on: step ${s.id - 1}`)
              .join('\n') +
            `\n\n### Risk Mitigation:\n` +
            `- Use haru_edit_file with backups enabled\n` +
            `- Validate after each major change\n` +
            `- Run tests in parallel to save time\n` +
            `- Review all changes before final commit\n` +
            `\n### Success Criteria:\n` +
            `- All tests pass\n` +
            `- No type errors\n` +
            `- Code formatted and linted\n` +
            `- Performance not degraded\n` +
            `- Documentation updated`,
        },
      ],
      structuredContent: payload as Record<string, unknown>,
    };
  },
});
