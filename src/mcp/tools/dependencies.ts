import { z } from 'zod';
import { config } from '../config.js';
import { okText, tool, toolError } from '../server.js';
import { READ_OPEN_WORLD } from '../types.js';
import { mapLimit } from '../utils/concurrency.js';
import { esc, runCmd } from '../utils/exec.js';

// ---------- haru_analyze_dependencies ----------

const AnalyzeDependenciesInput = z
  .object({
    depth: z
      .number()
      .int()
      .min(0)
      .max(5)
      .default(2)
      .describe('Transitive tree depth (0-5, default 2)'),
    includeDev: z.boolean().default(true).describe('Include devDependencies (default true)'),
    checkVulnerabilities: z
      .boolean()
      .default(false)
      .describe('Run `npm audit --json` (default false — hammers the registry)'),
  })
  .strict();

tool({
  name: 'haru_analyze_dependencies',
  title: 'Analyze Dependencies',
  description: `Analyze project dependencies from package.json: current vs latest, descriptions, transitive deps, optional npm audit, and a cheap "potentially unused" list (via git grep, NOT a full repo scan).

Read-only.

Args:
  - depth (0-5, default 2)
  - includeDev (bool, default true)
  - checkVulnerabilities (bool, default false)`,
  inputSchema: AnalyzeDependenciesInput,
  annotations: READ_OPEN_WORLD,
  callback: async ({ depth, includeDev, checkVulnerabilities }) => {
    try {
      const pkgResult = await runCmd('cat package.json');
      if (pkgResult.code !== 0) {
        return toolError('failed to read package.json', pkgResult.stderr);
      }
      const pkg = JSON.parse(pkgResult.stdout);
      const deps: Record<string, string> = {
        ...pkg.dependencies,
        ...(includeDev ? pkg.devDependencies : {}),
      };
      const entries = Object.entries(deps);
      const tree: Record<
        string,
        {
          version: string;
          latest?: string;
          description?: string;
          dependencies: Record<string, string>;
          vulnerabilities: unknown[];
          error?: string;
        }
      > = {};

      // Single audit if requested.
      const auditMap = checkVulnerabilities ? await getAllVulnerabilities() : {};

      await mapLimit(entries, config.networkConcurrency, async ([name, version]) => {
        try {
          const info = await runCmd(`npm view ${esc(name)} --json`, { timeout: 15_000 });
          if (info.code !== 0) throw new Error(info.stderr || 'npm view failed');
          const parsed = JSON.parse(info.stdout);
          tree[name] = {
            version,
            latest: parsed['dist-tags']?.latest,
            description: parsed.description,
            dependencies: parsed.dependencies || {},
            vulnerabilities: checkVulnerabilities ? (auditMap[name] ?? []) : [],
          };
        } catch {
          tree[name] = {
            version,
            dependencies: {},
            vulnerabilities: checkVulnerabilities ? (auditMap[name] ?? []) : [],
            error: 'Failed to fetch info from registry',
          };
        }
      });

      const used = await findUsedDependencies();
      const safeDepth = Math.min(Math.max(0, Math.trunc(depth)), 5);
      const normalize = (v: string) => v.replace(/^[^\d]*/, '').trim();

      const total = Object.keys(tree).length;
      const outdated = Object.values(tree).filter(
        (v) => v.latest && normalize(v.version) !== v.latest,
      ).length;
      const vulnerabilities = Object.values(tree).flatMap((v) => v.vulnerabilities || []).length;
      const unused = total ? Object.keys(tree).filter((d) => !used.includes(d)) : [];
      const nested = buildTree(tree, safeDepth);

      const text =
        `Dependency Analysis Report:\n\n` +
        `**Total:** ${total}\n` +
        `**Outdated:** ${outdated}\n` +
        `**Vulnerabilities:** ${vulnerabilities}\n` +
        `**Potentially Unused:** ${unused.length}\n\n` +
        (unused.length ? `Unused packages: ${unused.join(', ')}\n\n` : '') +
        `Full tree:\n${JSON.stringify(nested, null, 2)}`;
      return okText(text);
    } catch (err) {
      return toolError(
        'dependency analysis failed',
        `Details: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },
});

async function getAllVulnerabilities(): Promise<Record<string, unknown[]>> {
  try {
    const r = await runCmd('npm audit --json', { timeout: 30_000 });
    const audit = JSON.parse(r.stdout);
    if (audit.vulnerabilities && typeof audit.vulnerabilities === 'object') {
      return audit.vulnerabilities as Record<string, unknown[]>;
    }
    if (audit.advisories) {
      const grouped: Record<string, unknown[]> = {};
      for (const a of Object.values(audit.advisories as Record<string, { module_name: string }>)) {
        const list = grouped[a.module_name] ?? [];
        list.push(a);
        grouped[a.module_name] = list;
      }
      return grouped;
    }
    return {};
  } catch {
    return {};
  }
}

/**
 * Find packages imported anywhere in the repo using a SINGLE git grep pass
 * over the `from 'X'` / `require('X')` patterns. Much lighter than the old
 * find + readFileFull approach.
 */
async function findUsedDependencies(): Promise<string[]> {
  try {
    const r = await runCmd(
      `git grep -h -E "from[[:space:]]+['\\"][^'\\"]+['\\"]|require\\(['\\"][^'\\"]+['\\"]\\)" | grep -oE "['\\"][^'\\"]+['\\"]" | tr -d "'\\"" | sort -u`,
    );
    const used = new Set<string>();
    for (const raw of r.stdout.split('\n')) {
      const pkg = raw.trim();
      if (!pkg || pkg.startsWith('.') || pkg.startsWith('/')) continue;
      const parts = pkg.split('/');
      const name = pkg.startsWith('@') && parts.length >= 2 ? `${parts[0]}/${parts[1]}` : parts[0];
      if (name) used.add(name);
    }
    return [...used].sort();
  } catch {
    return [];
  }
}

function buildTree(
  deps: Record<string, { dependencies: Record<string, string> }>,
  depth: number,
  level = 0,
): Record<string, unknown> {
  if (level >= depth) return {};
  const tree: Record<string, unknown> = {};
  for (const [name, info] of Object.entries(deps)) {
    tree[name] = {
      ...info,
      dependencies: buildTree(
        info.dependencies as unknown as Record<string, { dependencies: Record<string, string> }>,
        depth,
        level + 1,
      ),
    };
  }
  return tree;
}
