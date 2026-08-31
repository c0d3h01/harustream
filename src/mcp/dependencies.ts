import { z } from 'zod';
import { config, esc, mapLimit, runCmd, tool, toolError } from './core.js';

// ============================================
// DEPENDENCY ANALYSIS TOOLS
// ============================================

const AnalyzeDependenciesInput = z
  .object({
    depth: z
      .number()
      .int()
      .min(0)
      .max(5)
      .default(2)
      .describe('Dependency tree depth (0-5, default 2)'),
    includeDev: z.boolean().default(true).describe('Include devDependencies (default: true)'),
    checkVulnerabilities: z
      .boolean()
      .default(false)
      .describe('Check known vulnerabilities via npm audit (default: false)'),
  })
  .strict();

tool({
  name: 'haru_analyze_dependencies',
  title: 'Analyze Dependencies',
  description: `Analyze project dependencies from package.json: current vs latest versions, descriptions, transitive deps, npm audit vulnerabilities, and potentially unused packages.

Read-only. Registry lookups are rate-limited to MCP_NETWORK_CONCURRENCY parallel calls with a 15s timeout each.

Args:
  - depth (number): dependency tree depth, 0-5 (default 2)
  - includeDev (boolean): include devDependencies (default true)
  - checkVulnerabilities (boolean): run npm audit for the tree (default false)

Returns:
  Text: total/outdated/vulnerabilities/potentially-unused counts + unused package list + full tree.

Examples:
  - Use when: "What dependencies are outdated?" -> defaults
  - Use when: "Are there any known vulnerabilities?" -> checkVulnerabilities=true
  - Use when: "Which packages are imported nowhere?" -> defaults, then read the Unused list

Error Handling:
  - A package whose registry lookup fails is still listed with error info
  - Returns Error: dependency analysis failed if package.json cannot be read`,
  inputSchema: AnalyzeDependenciesInput,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  callback: async ({ depth, includeDev, checkVulnerabilities }) => {
    try {
      const pkgResult = await runCmd('cat package.json');
      const pkg = JSON.parse(pkgResult.stdout);

      const deps = { ...pkg.dependencies, ...(includeDev ? pkg.devDependencies : {}) };
      const tree: Record<string, any> = {};
      const entries = Object.entries(deps);

      await mapLimit(entries, config.networkConcurrency, async ([name, version]) => {
        try {
          const info = await runCmd(`npm view ${esc(name)} --json`, { timeout: 15_000 });
          const parsed = JSON.parse(info.stdout);
          tree[name] = {
            version: version as string,
            latest: parsed['dist-tags']?.latest,
            description: parsed.description,
            dependencies: parsed.dependencies || {},
            vulnerabilities: checkVulnerabilities
              ? await checkVulnerabilitiesForPackage(name, version as string)
              : [],
          };
        } catch {
          tree[name] = { version, error: 'Failed to fetch info from registry' };
        }
      });

      const usedDeps = await findUsedDependencies();

      const safeDepth = Math.min(Math.max(0, Math.trunc(depth)), 5);

      const analysis = {
        totalDependencies: Object.keys(tree).length,
        outdated: Object.entries(tree).filter(([_, v]) => v.latest && v.version !== v.latest)
          .length,
        vulnerabilities: Object.values(tree).flatMap((v) => v.vulnerabilities).length,
        unused: Object.keys(tree).filter((d) => !usedDeps.includes(d)),
        tree: buildDependencyTree(tree, safeDepth),
      };

      return {
        content: [
          {
            type: 'text',
            text:
              `Dependency Analysis Report:\n\n` +
              `**Total:** ${analysis.totalDependencies}\n` +
              `**Outdated:** ${analysis.outdated}\n` +
              `**Vulnerabilities:** ${analysis.vulnerabilities}\n` +
              `**Potentially Unused:** ${analysis.unused.length}\n\n` +
              `Unused packages: ${analysis.unused.join(', ') || 'None'}\n\n` +
              `Full tree:\n${JSON.stringify(analysis.tree, null, 2)}`,
          },
        ],
      };
    } catch (err) {
      return toolError(
        'dependency analysis failed',
        `Details: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },
});

async function checkVulnerabilitiesForPackage(name: string, version: string): Promise<any[]> {
  try {
    const result = await runCmd(`npm audit --package ${esc(name)}@${esc(version)} --json`, {
      timeout: 15_000,
    });
    const audit = JSON.parse(result.stdout);
    return audit.vulnerabilities?.[name] || [];
  } catch {
    return [];
  }
}

async function findUsedDependencies(): Promise<string[]> {
  const result = await runCmd(
    `git grep -h -E '(?:import|require)\\s*["']([^"']+)["']' | grep -oE '^[^'' ]+' | sort | uniq`,
  );
  return result.stdout.split('\n').filter(Boolean);
}

function buildDependencyTree(
  deps: Record<string, any>,
  depth: number,
  current: string = '',
  level: number = 0,
): any {
  if (level >= depth) return {};

  const tree: Record<string, any> = {};
  for (const [name, info] of Object.entries(deps)) {
    if (name.startsWith(current)) {
      tree[name] = {
        ...info,
        dependencies: buildDependencyTree(info.dependencies || {}, depth, name, level + 1),
      };
    }
  }
  return tree;
}
