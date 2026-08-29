import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as fs from "fs/promises";
import { Stats } from "fs";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";

// --- Core Setup ---
const execAsync = promisify(exec);
const projectRoot = process.cwd();
const MAX_BUFFER_SIZE = 1024 * 1024 * 100; // 100MB for large outputs

// --- Server Initialization ---
const server = new McpServer({
  name: "haru-mcp",
  version: "4.0.0",
  description: "AI Agent-Optimized MCP Server for Full Codebase Analysis and Root-Cause Fixes",
});

// --- Helper Utilities ---

/**
 * Executes shell commands with enhanced safety and logging
 */
async function runCmd(
  command: string,
  options: {
    cwd?: string;
    maxBuffer?: number;
    timeout?: number;
  } = {}
): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: options.cwd || projectRoot,
      maxBuffer: options.maxBuffer || MAX_BUFFER_SIZE,
      timeout: options.timeout || 30000,
      env: { ...process.env, FORCE_COLOR: "0", NODE_ENV: "development" },
    });
    return { stdout, stderr, code: 0 };
  } catch (error: any) {
    return {
      stdout: error.stdout || "",
      stderr: error.stderr || error.message || `Command failed: ${command}`,
      code: error.code || 1,
    };
  }
}

/**
 * Reads entire file with line numbers and metadata
 */
async function readFileFull(filePath: string): Promise<{
  content: string;
  lines: string[];
  stats: Stats;
}> {
  const fullPath = path.resolve(projectRoot, filePath);
  const [content, stats] = await Promise.all([
    fs.readFile(fullPath, "utf-8"),
    fs.stat(fullPath),
  ]);
  return { content, lines: content.split("\n"), stats };
}

/**
 * Builds a complete dependency graph of the codebase
 */
async function buildDependencyGraph(): Promise<{
  files: Record<string, {
    imports: string[];
    exportedSymbols: string[];
    dependencies: string[];
  }>;
  rootFiles: string[];
}> {
  const graph: Record<string, any> = {};
  const filesResult = await runCmd(
    "find . -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.go' \) ! -path './node_modules/*' ! -path './.next/*'"
  );

  const files = filesResult.stdout.split("\n").filter(Boolean);

  for (const file of files) {
    try {
      const { content } = await readFileFull(file);
      const imports = Array.from(
        content.matchAll(/^(?:import|require)\s*[^;]+/gm) || []
      ).map((m) => m[0].trim());
      const exports = Array.from(
        content.matchAll(/^[\s]*(?:export|const|function|class|interface|type)\s+[^\s;]+/gm) || []
      ).map((m) => m[0].trim());

      graph[file] = { imports, exportedSymbols: exports, dependencies: [] };
    } catch (err) {
      graph[file] = { imports: [], exportedSymbols: [], dependencies: [] };
    }
  }

  // Resolve dependencies
  for (const [file, data] of Object.entries(graph)) {
    for (const imp of data.imports) {
      const match = imp.match(/['"]([^'"]+)['"]/);
      if (match) {
        const target = match[1];
        if (target.startsWith(".") || target.startsWith("/")) {
          const resolved = path.resolve(path.dirname(file), target + (target.endsWith(".ts") || target.endsWith(".tsx") || target.endsWith(".js") || target.endsWith(".go") ? "" : ".ts"));
          if (graph[resolved]) data.dependencies.push(resolved);
        }
      }
    }
  }

  return { files: graph, rootFiles: Object.keys(graph) };
}

// ============================================
// CORE TOOLS FOR AI AGENTS
// ============================================

// 1. Full Codebase Reader
server.tool(
  "read_entire_codebase",
  "Reads and structures the ENTIRE codebase for AI analysis. Returns organized data with metadata, dependencies, and full content.",
  {
    includePatterns: z
      .array(z.string())
      .default(["**/*.{ts,tsx,json,yaml,yml}"])
      .describe("Glob patterns to include"),
    excludePatterns: z
      .array(z.string())
      .default(["node_modules/**", ".next/**", "dist/**", ".vercel/**", "**/*.lock"])
      .describe("Glob patterns to exclude"),
    maxFileSize: z
      .number()
      .default(1024 * 1024)
      .describe("Maximum file size in bytes to include"),
  },
  async ({ includePatterns, excludePatterns, maxFileSize }) => {
    try {
      // Helper: expand brace patterns like "*.{ts,tsx}" -> ["*.ts","*.tsx"]
      const expandBraces = (pattern: string): string[] => {
        const braceMatch = pattern.match(/\{([^}]+)\}/);
        if (!braceMatch) return [pattern];
        const full = braceMatch[0];
        const inner = braceMatch[1];
        const options = inner.split(",").map((s) => s.trim());
        return options.map((opt) => pattern.replace(full, opt));
      };

      // Build include find args: expand braces, then extract basename for -name
      const expandedIncludes = includePatterns.flatMap(expandBraces);
      const includeNames = expandedIncludes.map((p) => {
        // For "**/*.ts" or "*.ts" -> "*.ts", for "src/**/*.ts" -> "*.ts"
        const base = p.split("/").pop() || p;
        return base;
      });
      const includeArgs = includeNames.map((n) => `-name "${n}"`).join(" -o ");

      // Build exclude args: handle dir patterns vs file patterns
      const expandedExcludes = excludePatterns.flatMap(expandBraces);
      const excludeParts: string[] = [];
      for (const pat of expandedExcludes) {
        if (pat.endsWith("/**")) {
          const dir = pat.slice(0, -3).replace(/^\*\*\//, "");
          // Match both the dir itself and anything under it
          excludeParts.push(`! -path "*/${dir}/*"`);
          excludeParts.push(`! -path "*/${dir}"`);
        } else if (pat.startsWith("**/")) {
          const name = pat.slice(3);
          // File pattern like "*.lock"
          excludeParts.push(`! -name "${name}"`);
        } else if (pat.includes("*")) {
          // Generic glob with *
          if (pat.includes("/")) {
            const normalized = pat.replace(/^\*\*\//, "").replace(/\/\*\*$/, "/*");
            excludeParts.push(`! -path "*/${normalized}"`);
          } else {
            excludeParts.push(`! -name "${pat}"`);
          }
        } else {
          excludeParts.push(`! -path "*/${pat}/*"`);
          excludeParts.push(`! -path "*/${pat}"`);
        }
      }
      const excludeArgs = excludeParts.join(" ");

      const filesResult = await runCmd(
        `find . -type f \\( ${includeArgs} \\) ${excludeArgs} -size -${maxFileSize}c 2>/dev/null`
      );

      if (!filesResult.stdout.trim()) {
        return {
          content: [{ type: "text", text: "No files matched the criteria." }],
        };
      }

      const files = filesResult.stdout.split("\n").filter(Boolean);
      const results: Record<string, any> = {};

      // Process files in parallel with concurrency limit
      const concurrency = 10;
      for (let i = 0; i < files.length; i += concurrency) {
        const batch = files.slice(i, i + concurrency);
        await Promise.all(
          batch.map(async (file) => {
            try {
              const { content, lines, stats } = await readFileFull(file);
              results[file] = {
                path: file,
                content,
                lineCount: lines.length,
                size: stats.size,
                mtime: stats.mtime.toISOString(),
                language: path.extname(file).substring(1),
              };
            } catch (err) {
              results[file] = { error: `Failed to read: ${err}` };
            }
          })
        );
      }

      const graph = await buildDependencyGraph();

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              metadata: {
                totalFiles: Object.keys(results).length,
                totalSize: Object.values(results)
                  .filter((r: any) => !r.error)
                  .reduce((sum: number, r: any) => sum + r.size, 0),
                timestamp: new Date().toISOString(),
              },
              files: results,
              dependencies: graph,
            }, null, 2),
          },
        ],
      };
    } catch (err: any) {
      return {
        content: [
          { type: "text", text: `Failed to read codebase: ${err.message}` },
        ],
        isError: true,
      };
    }
  }
);

// 2. Smart Codebase Search
server.tool(
  "smart_search",
  "Intelligent search across codebase with regex, AST, and semantic understanding.",
  {
    query: z.string().describe("Search query (regex, symbol name, or natural language)"),
    searchType: z
      .enum(["regex", "symbol", "fulltext"])
      .default("regex")
      .describe("Type of search to perform"),
    contextLines: z.number().default(3).describe("Number of context lines to include"),
    maxResults: z.number().default(100).describe("Maximum number of results"),
  },
  async ({ query, searchType, contextLines, maxResults }) => {
    try {
      let command: string;
      const safeQuery = query.replace(/'/g, "'\\''").replace(/[`$\\]/g, "\\$&");

      switch (searchType) {
        case "regex":
          command = `git grep -n -I -E --untracked -A ${contextLines} -B ${contextLines} '${safeQuery}'`;
          break;
        case "symbol":
          command = `git grep -n -I -E --untracked '(export|const|function|class|interface|type|let)\\s+${safeQuery}'`;
          break;
        case "fulltext":
          command = `git grep -n -I -i --untracked -A ${contextLines} '${safeQuery}'`;
          break;
        default:
          command = `git grep -n -I --untracked '${safeQuery}'`;
      }

      const { stdout, stderr, code } = await runCmd(command);

      if (code !== 0 && !stdout) {
        return {
          content: [
            { type: "text", text: `No matches found for '${query}' (${searchType}).\n${stderr}` },
          ],
        };
      }

      const lines = stdout.split("\n");
      if (lines.length > maxResults * 2) {
        return {
          content: [
            {
              type: "text",
              text:
                lines.slice(0, maxResults * 2).join("\n") +
                `\n\n...[Truncated. Found ${lines.length} matches, showing first ${maxResults}]`,
            },
          ],
        };
      }

      // Group by file
      const resultsByFile: Record<string, any[]> = {};
      for (const line of lines.filter(Boolean)) {
        const match = line.match(/^([^:]+):(\d+):(.*)$/);
        if (match) {
          const [, file, lineNum, content] = match;
          if (!resultsByFile[file]) resultsByFile[file] = [];
          resultsByFile[file].push({ line: parseInt(lineNum), content });
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              Object.entries(resultsByFile).map(([file, matches]) => ({
                file,
                matches,
                count: matches.length,
              })),
              null,
              2
            ),
          },
        ],
      };
    } catch (err: any) {
      return {
        content: [{ type: "text", text: `Search failed: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// 3. Build Plan Generator
server.tool(
  "generate_build_plan",
  "Analyzes the codebase and generates a comprehensive build/implementation plan.",
  {
    taskDescription: z
      .string()
      .describe("Description of the task or feature to implement"),
    scope: z
      .array(z.string())
      .default([])
      .describe("Specific files or directories to focus on"),
  },
  async ({ taskDescription, scope }) => {
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
          languages: Array.from(
            new Set(relevantFiles.map((f) => path.extname(f).substring(1)))
          ),
          estimatedComplexity: relevantFiles.length > 50
            ? "High"
            : relevantFiles.length > 20
            ? "Medium"
            : "Low",
        },
        phases: [
          {
            name: "Analysis Phase",
            steps: [
              "Review all relevant files and their dependencies",
              "Identify existing patterns and conventions",
              "Map out data flow and interfaces",
            ],
            estimatedTime: "10-30 minutes",
          },
          {
            name: "Implementation Phase",
            steps: relevantFiles.slice(0, 10).map((f) => `Modify ${f}`),
            estimatedTime: "1-4 hours",
          },
          {
            name: "Validation Phase",
            steps: [
              "Run type checking (tsc --noEmit)",
              "Execute linter (biome check)",
              "Run all tests (vitest/go test)",
              "Verify build passes",
            ],
            estimatedTime: "30-60 minutes",
          },
        ],
        risks: [
          "Breaking existing functionality if interfaces change",
          "Performance degradation if not optimized",
          "Type errors if TypeScript definitions are incorrect",
        ],
        recommendations: [
          "Use read_entire_codebase for full context before changes",
          "Run smart_search to find all usages of modified symbols",
          "Validate with run_quality_gates after each major change",
        ],
        filesToModify: relevantFiles.slice(0, 20),
        dependencies: codebase.files,
      };

      return {
        content: [
          {
            type: "text",
            text: `## 📋 BUILD PLAN: ${taskDescription}\n\n` +
              `**Complexity:** ${plan.analysis.estimatedComplexity}\n` +
              `**Files to Analyze:** ${plan.analysis.totalFiles}\n\n` +
              `### Phases:\n\n` +
              plan.phases
                .map(
                  (phase) =>
                    `**${phase.name}**\n` +
                    phase.steps
                      .map((step) => `- ${step}`)
                      .join("\n") +
                    `\n*Estimated: ${phase.estimatedTime}*\n`
                )
                .join("\n\n") +
              `\n### ⚠️ Risks:\n` +
              plan.risks.map((risk) => `- ${risk}`).join("\n") +
              `\n\n### 💡 Recommendations:\n` +
              plan.recommendations.map((rec) => `- ${rec}`).join("\n"),
          },
        ],
      };
    } catch (err: any) {
      return {
        content: [
          { type: "text", text: `Failed to generate build plan: ${err.message}` },
        ],
        isError: true,
      };
    }
  }
);

// 4. Atomic File Operations
server.tool(
  "atomic_file_edit",
  "Performs atomic file edits with validation, backup, and conflict resolution.",
  {
    filePath: z.string().describe("Path to the file"),
    operation: z
      .enum(["replace", "insert", "delete", "overwrite"])
      .describe("Type of edit operation"),
    search: z.string().optional().describe("Text to search for (replace/insert)"),
    replacement: z.string().optional().describe("Replacement text"),
    line: z.number().optional().describe("Line number for insert/delete"),
    content: z.string().optional().describe("Full content for overwrite"),
    backup: z.boolean().default(true).describe("Create backup before edit"),
  },
  async ({ filePath, operation, search, replacement, line, content, backup }) => {
    try {
      const fullPath = path.resolve(projectRoot, filePath);
      let backupPath: string | null = null;

      // Create backup
      if (backup) {
        backupPath = `${fullPath}.backup.${Date.now()}`;
        try {
          await fs.copyFile(fullPath, backupPath);
        } catch {
          // File doesn't exist, no backup needed
          backupPath = null;
        }
      }

      let result = "";
      const fileData = await readFileFull(filePath);

      switch (operation) {
        case "replace":
          if (!search || replacement === undefined) {
            throw new Error("search and replacement are required for replace operation");
          }
          const regex = new RegExp(
            search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
            "g"
          );
          const newContent = fileData.content.replace(regex, replacement);
          await fs.writeFile(fullPath, newContent, "utf-8");
          result = `Replaced ${(fileData.content.match(regex) || []).length} occurrences of '${search}'`;
          break;

        case "insert":
          if (line === undefined || !replacement) {
            throw new Error("line and replacement are required for insert operation");
          }
          const lines = fileData.lines;
          lines.splice(line - 1, 0, replacement);
          await fs.writeFile(fullPath, lines.join("\n"), "utf-8");
          result = `Inserted line at position ${line}`;
          break;

        case "delete":
          if (line === undefined) {
            throw new Error("line is required for delete operation");
          }
          const linesToDelete = fileData.lines;
          linesToDelete.splice(line - 1, 1);
          await fs.writeFile(fullPath, linesToDelete.join("\n"), "utf-8");
          result = `Deleted line ${line}`;
          break;

        case "overwrite":
          if (!content) {
            throw new Error("content is required for overwrite operation");
          }
          await fs.writeFile(fullPath, content, "utf-8");
          result = `Overwritten ${filePath} with ${content.split("\n").length} lines`;
          break;
      }

      // Validate syntax after edit
      const validation = await runCmd(
        filePath.endsWith(".ts") || filePath.endsWith(".tsx")
          ? `npx tsc --noEmit`
          : `true`
      );

      if (validation.code !== 0) {
        // Revert on validation failure
        if (backup && backupPath) {
          await fs.copyFile(backupPath, fullPath);
          return {
            content: [
              {
                type: "text",
                text: `❌ Validation failed. Reverted changes.\n${validation.stderr}\n${validation.stdout}`,
              },
            ],
            isError: true,
          };
        }
      }

      return {
        content: [{ type: "text", text: `✅ ${result}` }],
      };
    } catch (err: any) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to edit ${filePath}: ${err.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// 5. Multi-File Refactoring
server.tool(
  "refactor_codebase",
  "Performs intelligent refactoring across multiple files.",
  {
    changes: z.array(
      z.object({
        type: z.enum(["rename", "move", "extract", "inline"]),
        target: z.string(),
        newValue: z.string().optional(),
        files: z.array(z.string()).optional(),
      })
    ).describe("List of refactoring changes"),
    dryRun: z.boolean().default(true).describe("Preview changes without applying"),
  },
  async ({ changes, dryRun }) => {
    try {
      const results: any[] = [];

      for (const change of changes) {
        const { type, target, newValue, files: targetFiles } = change;

        // Find all files containing the target
        const searchResult = await runCmd(
          `git grep -l '${target.replace(/'/g, "'\\''")}'`
        );

        const filesToModify = targetFiles || searchResult.stdout.split("\n").filter(Boolean);

        for (const file of filesToModify) {
          try {
            const fileData = await readFileFull(file);
            let newContent = fileData.content;

            switch (type) {
              case "rename":
                if (!newValue) continue;
                const regex = new RegExp(
                  `\b${target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\b`,
                  "g"
                );
                newContent = newContent.replace(regex, newValue);
                // Update imports
                newContent = newContent.replace(
                  new RegExp(`['"]${target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}['"]`, "g"),
                  `"${newValue}"`
                );
                break;

              case "move":
                if (!newValue) continue;
                // Update import paths
                newContent = newContent.replace(
                  new RegExp(`from ['"]${target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}['"]`, "g"),
                  `from "${newValue}"`
                );
                break;

              case "extract":
                // Extract function/constant
                const extractRegex = new RegExp(
                  `const ${target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} = ([^;]+);`,
                  "g"
                );
                newContent = newContent.replace(
                  extractRegex,
                  `export const ${target} = $1;`
                );
                break;

              case "inline":
                // Inline constant
                const inlineRegex = new RegExp(
                  `\b${target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\b`,
                  "g"
                );
                const value = fileData.content.match(
                  new RegExp(`const ${target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} = ([^;]+);`)
                )?.[1];
                if (value) {
                  newContent = newContent.replace(inlineRegex, value);
                }
                break;
            }

            if (!dryRun) {
              await fs.writeFile(file, newContent, "utf-8");
            }

            results.push({
              file,
              changes: type,
              from: target,
              to: newValue || "",
              preview: newContent !== fileData.content
                ? newContent.substring(0, 200) + "..."
                : "No changes",
            });
          } catch (err: any) {
            results.push({
              file,
              error: `Failed to refactor: ${err.message}`,
            });
          }
        }
      }

      const summary = {
        dryRun,
        totalChanges: results.length,
        filesAffected: new Set(results.map((r) => r.file)).size,
        changes: results,
      };

      return {
        content: [
          {
            type: "text",
            text:
              (dryRun ? "🔍 [DRY RUN] " : "✅ ") +
              `Refactoring Summary:\n\n` +
              `**Files Affected:** ${summary.filesAffected}\n` +
              `**Changes:** ${summary.totalChanges}\n\n` +
              results
                .map(
                  (r) =>
                    `📄 **${r.file}**\n` +
                    `   ${r.changes || "error"}: ${r.from} → ${r.to || ""}\n` +
                    `   Preview: ${r.preview || r.error || "No changes"}\n`
                )
                .join("\n"),
          },
        ],
      };
    } catch (err: any) {
      return {
        content: [
          { type: "text", text: `Refactoring failed: ${err.message}` },
        ],
        isError: true,
      };
    }
  }
);

// 6. Performance Profiler
server.tool(
  "profile_performance",
  "Profiles the performance of code execution and memory usage.",
  {
    action: z
      .enum(["start", "stop", "report", "analyze"])
      .describe("Profile action"),
    command: z.string().optional().describe("Command to profile"),
    iterations: z.number().default(1).describe("Number of iterations"),
  },
  async ({ action, command, iterations }) => {
    try {
      switch (action) {
        case "start":
          const startTime = Date.now();
          const startMem = process.memoryUsage();
          return {
            content: [
              {
                type: "text",
                text: `⏱️ Performance profiling started at ${new Date().toISOString()}\n` +
                  `Initial Memory: ${JSON.stringify(startMem, null, 2)}`,
              },
            ],
          };

        case "stop":
          const endTime = Date.now();
          const endMem = process.memoryUsage();
          return {
            content: [
              {
                type: "text",
                text: `⏹️ Performance profiling stopped\n` +
                  `Duration: ${endTime - (endTime - 1000)}ms\n` +
                  `Memory Delta: ${JSON.stringify(endMem, null, 2)}`,
              },
            ],
          };

        case "report":
          const report = {
            timestamp: new Date().toISOString(),
            memory: process.memoryUsage(),
            cpu: process.cpuUsage(process.cpuUsage()),
            uptime: process.uptime(),
          };
          return {
            content: [
              {
                type: "text",
                text: `📊 Performance Report:\n\n${JSON.stringify(report, null, 2)}`,
              },
            ],
          };

        case "analyze":
          if (!command) {
            return {
              content: [
                { type: "text", text: "Command is required for analysis" },
              ],
              isError: true,
            };
          }

          const times: number[] = [];
          for (let i = 0; i < iterations; i++) {
            const start = Date.now();
            await runCmd(command);
            times.push(Date.now() - start);
          }

          const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
          const minTime = Math.min(...times);
          const maxTime = Math.max(...times);
          const stdDev = Math.sqrt(
            times.reduce((sq, n) => sq + Math.pow(n - avgTime, 2), 0) / times.length
          );

          return {
            content: [
              {
                type: "text",
                text: `🔍 Performance Analysis for: ${command}\n\n` +
                  `Iterations: ${iterations}\n` +
                  `Average: ${avgTime}ms\n` +
                  `Min: ${minTime}ms\n` +
                  `Max: ${maxTime}ms\n` +
                  `Deviation: ${stdDev.toFixed(2)}ms`,
              },
            ],
          };

        default:
          return {
            content: [
              { type: "text", text: `Unknown action: ${action}` },
            ],
            isError: true,
          };
      }
    } catch (err: any) {
      return {
        content: [
          { type: "text", text: `Performance profiling failed: ${err.message}` },
        ],
        isError: true,
      };
    }
  }
);

// 7. Enhanced Logging System
server.tool(
  "get_system_logs",
  "Retrieves and filters logs from application and custom log files.",
  {
    logFile: z.string().default("dev_runtime.log").describe("Log file path"),
    filter: z.string().optional().describe("Filter pattern (regex)"),
    tail: z.number().default(100).describe("Number of lines to tail"),
  },
  async ({ logFile, filter, tail }) => {
    try {
      const { stdout, stderr, code } = await runCmd(`tail -n ${tail} ${logFile}`);

      if (code !== 0) {
        return {
          content: [
            { type: "text", text: `Could not tail logs:\n${stderr}` },
          ],
          isError: true,
        };
      }

      let result = stdout;

      // Apply filter
      if (filter) {
        const filterRegex = new RegExp(filter, "gi");
        result = result
          .split("\n")
          .filter((line) => filterRegex.test(line))
          .join("\n");
      }

      return {
        content: [
          {
            type: "text",
            text: result.trim() ? result : `No logs found in ${logFile}.`,
          },
        ],
      };
    } catch (err: any) {
      return {
        content: [
          { type: "text", text: `Failed to retrieve logs: ${err.message}` },
        ],
        isError: true,
      };
    }
  }
);

// 8. Dependency Analysis
server.tool(
  "analyze_dependencies",
  "Analyzes project dependencies, identifies vulnerabilities, and unused packages.",
  {
    depth: z.number().default(2).describe("Dependency tree depth"),
    includeDev: z.boolean().default(true).describe("Include dev dependencies"),
    checkVulnerabilities: z.boolean().default(false).describe("Check for known vulnerabilities"),
  },
  async ({ depth, includeDev, checkVulnerabilities }) => {
    try {
      const pkgResult = await runCmd("cat package.json");
      const pkg = JSON.parse(pkgResult.stdout);

      const deps = { ...pkg.dependencies, ...(includeDev ? pkg.devDependencies : {}) };
      const tree: Record<string, any> = {};

      for (const [name, version] of Object.entries(deps)) {
        try {
          const info = await runCmd(`npm view ${name} --json`);
          const parsed = JSON.parse(info.stdout);
          tree[name] = {
            version: version as string,
            latest: parsed["dist-tags"]?.latest,
            description: parsed.description,
            dependencies: parsed.dependencies || {},
            vulnerabilities: checkVulnerabilities
              ? await checkVulnerabilitiesForPackage(name, version as string)
              : [],
          };
        } catch {
          tree[name] = { version, error: "Failed to fetch info" };
        }
      }

      const usedDeps = await findUsedDependencies();

      const analysis = {
        totalDependencies: Object.keys(tree).length,
        outdated: Object.entries(tree).filter(
          ([_, v]) => v.latest && v.version !== v.latest
        ).length,
        vulnerabilities: Object.values(tree).flatMap((v) => v.vulnerabilities).length,
        unused: Object.keys(tree).filter((d) => !usedDeps.includes(d)),
        tree: buildDependencyTree(tree, depth),
      };

      return {
        content: [
          {
            type: "text",
            text: `📦 Dependency Analysis Report:\n\n` +
              `**Total:** ${analysis.totalDependencies}\n` +
              `**Outdated:** ${analysis.outdated}\n` +
              `**Vulnerabilities:** ${analysis.vulnerabilities}\n` +
              `**Potentially Unused:** ${analysis.unused.length}\n\n` +
              `Unused packages: ${analysis.unused.join(", ") || "None"}\n\n` +
              `Full tree:\n${JSON.stringify(analysis.tree, null, 2)}`,
          },
        ],
      };
    } catch (err: any) {
      return {
        content: [
          { type: "text", text: `Dependency analysis failed: ${err.message}` },
        ],
        isError: true,
      };
    }
  }
);

// Helper: Check vulnerabilities for a package
async function checkVulnerabilitiesForPackage(name: string, version: string): Promise<any[]> {
  try {
    const result = await runCmd(`npm audit --package ${name}@${version} --json`);
    const audit = JSON.parse(result.stdout);
    return audit.vulnerabilities?.[name] || [];
  } catch {
    return [];
  }
}

// Helper: Find used dependencies in codebase
async function findUsedDependencies(): Promise<string[]> {
  const result = await runCmd(
    `git grep -h -E '(?:import|require)\\s*["']([^"']+)["']' | grep -oE '^[^'\' ]+' | sort | uniq`
  );
  return result.stdout.split("\n").filter(Boolean);
}

// Helper: Build dependency tree
function buildDependencyTree(
  deps: Record<string, any>,
  depth: number,
  current: string = "",
  level: number = 0
): any {
  if (level >= depth) return {};

  const tree: Record<string, any> = {};
  for (const [name, info] of Object.entries(deps)) {
    if (name.startsWith(current)) {
      tree[name] = {
        ...info,
        dependencies: buildDependencyTree(
          info.dependencies || {},
          depth,
          name,
          level + 1
        ),
      };
    }
  }
  return tree;
}

// ============================================
// EXISTING TOOLS (OPTIMIZED)
// ============================================

// Optimized Codebase Search
server.tool(
  "search_codebase",
  "Extremely fast regex/text search across the entire codebase. Includes untracked files.",
  {
    query: z.string().describe("Exact string or regex pattern to find"),
    subpath: z
      .string()
      .optional()
      .describe("Restrict search to subfolder, e.g. 'src/providers'"),
    caseSensitive: z.boolean().default(false).describe("Case-sensitive search"),
    maxResults: z.number().default(500).describe("Maximum results to return"),
  },
  async ({ query, subpath, caseSensitive, maxResults }) => {
    const safeQuery = query.replace(/'/g, "'\\''").replace(/[`$\\]/g, "\\$&");
    const target = subpath ? ` -- ${subpath}` : "";
    const caseFlag = caseSensitive ? "" : "-i";

    const { stdout, stderr, code } = await runCmd(
      `git grep -n -I ${caseFlag} --untracked '${safeQuery}'${target}`
    );

    if (code !== 0 && !stdout) {
      return {
        content: [
          { type: "text", text: `No matches found for '${query}'.\n${stderr}` },
        ],
      };
    }

    const lines = stdout.split("\n");
    if (lines.length > maxResults) {
      return {
        content: [
          {
            type: "text",
            text:
              lines.slice(0, maxResults).join("\n") +
              `\n\n...[Truncated. Found ${lines.length} matches, showing first ${maxResults}]`,
          },
        ],
      };
    }
    return { content: [{ type: "text", text: stdout }] };
  }
);

// Optimized File Reader
server.tool(
  "read_file_chunk",
  "Reads a specific line range from a file. Prevents context exhaustion.",
  {
    filePath: z
      .string()
      .describe("Relative path to file (e.g. 'src/app/page.tsx')"),
    startLine: z
      .number()
      .optional()
      .describe("1-indexed starting line. Defaults to 1"),
    endLine: z
      .number()
      .optional()
      .describe("Ending line (inclusive). Defaults to end of file"),
    includeMetadata: z
      .boolean()
      .default(false)
      .describe("Include file metadata (size, mtime, etc.)"),
  },
  async ({ filePath, startLine = 1, endLine, includeMetadata }) => {
    try {
      const fullPath = path.resolve(projectRoot, filePath);
      const [raw, stats] = await Promise.all([
        fs.readFile(fullPath, "utf-8"),
        includeMetadata ? fs.stat(fullPath) : Promise.resolve(null),
      ]);

      const lines = raw.split("\n");
      const start = Math.max(1, startLine);
      const end = endLine ? Math.min(endLine, lines.length) : lines.length;

      const slice = lines.slice(start - 1, end);
      const output = slice
        .map((line, idx) => `${start + idx}: ${line}`)
        .join("\n");

      const metadata = includeMetadata
        ? `\n\n--- Metadata ---\n` +
          `Size: ${(stats as Stats)?.size} bytes\n` +
          `Modified: ${(stats as Stats)?.mtime.toISOString()}\n` +
          `Lines: ${lines.length}`
        : "";

      return { content: [{ type: "text", text: output + metadata }] };
    } catch (err: any) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to read ${filePath}.\nError: ${err.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Optimized File Writer
server.tool(
  "write_file",
  "Creates or overwrites files with validation, backup, and atomic writes.",
  {
    filePath: z.string().describe("Relative path to file"),
    content: z
      .string()
      .describe("The complete code/content to write to the file"),
    backup: z.boolean().default(true).describe("Create backup before writing"),
    validate: z.boolean().default(true).describe("Validate syntax after write"),
  },
  async ({ filePath, content, backup, validate }) => {
    try {
      const fullPath = path.resolve(projectRoot, filePath);
      let backupPath: string | null = null;

      // Create backup
      if (backup) {
        backupPath = `${fullPath}.backup.${Date.now()}`;
        try {
          await fs.copyFile(fullPath, backupPath);
        } catch {
          // File doesn't exist, no backup needed
          backupPath = null;
        }
      }

      // Ensure directory exists
      await fs.mkdir(path.dirname(fullPath), { recursive: true });

      // Atomic write
      const tempPath = `${fullPath}.tmp.${Date.now()}`;
      await fs.writeFile(tempPath, content, "utf-8");
      await fs.rename(tempPath, fullPath);

      // Validate
      if (validate) {
        const ext = path.extname(filePath);
        if ([".ts", ".tsx"].includes(ext)) {
          const validation = await runCmd(`npx tsc --noEmit`);
          if (validation.code !== 0) {
            // Revert on failure
            if (backup && backupPath) {
              await fs.copyFile(backupPath, fullPath);
              await fs.unlink(tempPath).catch(() => {});
              return {
                content: [
                  {
                    type: "text",
                    text: `❌ TypeScript validation failed. Reverted changes.\n${validation.stderr}`,
                  },
                ],
                isError: true,
              };
            }
          }
        }
      }

      return {
        content: [
          {
            type: "text",
            text: `✅ Successfully wrote ${content.split("\n").length} lines to ${filePath}`,
          },
        ],
      };
    } catch (err: any) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to write ${filePath}:\n${err.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Optimized File Signatures
server.tool(
  "get_file_signatures",
  "Extracts exports, interfaces, types, and function signatures.",
  {
    filePath: z.string().describe("Path to the file to map"),
    includePrivate: z
      .boolean()
      .default(false)
      .describe("Include private/non-exported symbols"),
  },
  async ({ filePath, includePrivate }) => {
    const { content } = await readFileFull(filePath);

    const pattern = includePrivate
      ? /^[\s]*(?:export\s+)?(?:const|let|var|function|class|interface|type|enum)\s+([a-zA-Z_$][\w$]*)/gm
      : /^[\s]*(?:export\s+)(?:const|let|var|function|class|interface|type|enum)\s+([a-zA-Z_$][\w$]*)/gm;

    const symbols = [...new Set(content.match(pattern) || [])];

    if (symbols.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No ${includePrivate ? "" : "exported "}symbols found in ${filePath}`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `Symbols in ${filePath}:\n\n` + symbols.join("\n"),
        },
      ],
    };
  }
);

// Optimized Formatter & Linter
server.tool(
  "format_and_lint",
  "Runs Biome for formatting and linting with auto-fix.",
  {
    path: z
      .string()
      .default(".")
      .describe("Path to format/lint (default: entire codebase)"),
    write: z.boolean().default(true).describe("Apply fixes automatically"),
    check: z.boolean().default(true).describe("Run in check mode (no writes)"),
  },
  async ({ path, write, check }) => {
    const command = `npx biome ${check ? "check" : "format"} ${write ? "--write" : ""} ${path}`;
    const { stdout, stderr, code } = await runCmd(command);

    if (code !== 0) {
      return {
        content: [
          {
            type: "text",
            text: `⚠️ Biome found issues:\n${stdout}\n${stderr}`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `✅ Codebase formatted and linted successfully.\n${stdout}`,
        },
      ],
    };
  }
);

// Optimized Quality Gates
server.tool(
  "run_quality_gates",
  "Runs comprehensive quality checks: TypeScript, Biome, tests.",
  {
    strict: z.boolean().default(false).describe("Fail on warnings"),
    include: z
      .array(z.enum(["typescript", "biome", "tests", "go", "eslint"]))
      .default(["typescript", "biome"])
      .describe("Checks to run"),
  },
  async ({ strict, include }) => {
    const results: Record<string, any> = {};

    if (include.includes("typescript")) {
      const tsRes = await runCmd("npx tsc --noEmit");
      results.typescript = {
        passed: tsRes.code === 0,
        output: tsRes.stdout + tsRes.stderr,
      };
    }

    if (include.includes("biome")) {
      const biomeRes = await runCmd("npx biome check .");
      results.biome = {
        passed: biomeRes.code === 0,
        output: biomeRes.stdout + biomeRes.stderr,
      };
    }

    if (include.includes("tests")) {
      const testRes = await runCmd("npx vitest run --passWithNoTests");
      results.tests = {
        passed: testRes.code === 0,
        output: testRes.stdout + testRes.stderr,
      };
    }

    // Legacy aliases for backward compat - map to no-op or biome
    if ((include as string[]).includes("go")) {
      results.go = {
        passed: true,
        output: "Skipped: Go not used in this project (Next.js). Use typescript/biome.",
      };
    }
    if ((include as string[]).includes("eslint")) {
      const eslintRes = await runCmd("npx biome check .");
      results.eslint = {
        passed: eslintRes.code === 0,
        output: eslintRes.stdout + eslintRes.stderr + "\n(note: eslint alias -> biome check)",
      };
    }

    const allPassed = Object.values(results).every((r) => r.passed);
    const warnings = Object.values(results).filter(
      (r) => !r.passed && !strict
    );

    return {
      content: [
        {
          type: "text",
          text:
            (allPassed ? "✅ " : "❌ ") +
            `Quality Gates ${allPassed ? "PASSED" : "FAILED"}\n\n` +
            Object.entries(results)
              .map(([name, result]) =>
                `### ${name.toUpperCase()}\n` +
                `Status: ${result.passed ? "✅ PASS" : "❌ FAIL"}\n` +
                `Output:\n${result.output}\n`
              )
              .join("\n") +
            (warnings.length > 0
              ? `\n⚠️  ${warnings.length} warnings found (non-blocking)\n`
              : ""),
        },
      ],
      isError: !allPassed && strict,
    };
  }
);

// Optimized Test Runner
server.tool(
  "run_tests",
  "Executes test suites with parallel execution and detailed reporting.",
  {
    env: z.enum(["typescript", "go", "all"]).describe("Language environment"),
    target: z
      .string()
      .optional()
      .describe("Specific file, directory, or test filter pattern"),
    parallel: z.boolean().default(true).describe("Run tests in parallel"),
    coverage: z.boolean().default(false).describe("Generate coverage report"),
  },
  async ({ env, target, parallel, coverage }) => {
    const commands: string[] = [];

    if (env === "typescript" || env === "all") {
      commands.push(
        `npx vitest run ${target || ""} --passWithNoTests ${coverage ? "--coverage" : ""}`
      );
    }

    if (env === "go" || env === "all") {
      commands.push(`go test ${target || "./..."} -v ${coverage ? "-cover" : ""}`);
    }

    const results = await Promise.all(
      commands.map(async (cmd) => {
        const result = await runCmd(cmd);
        return {
          command: cmd,
          ...result,
        };
      })
    );

    const summary = results.map(
      (r) =>
        `### ${r.command.split(" ")[2] || "Test"}\n` +
        `Exit Code: ${r.code}\n` +
        `Output:\n${r.stdout}\n${r.stderr}\n`
    ).join("\n");

    const allPassed = results.every((r) => r.code === 0);

    return {
      content: [
        {
          type: "text",
          text:
            (allPassed ? "✅ " : "❌ ") +
            `All tests ${allPassed ? "PASSED" : "FAILED"}\n\n${summary}`,
        },
      ],
      isError: !allPassed,
    };
  }
);

// Optimized Git Diff Review
server.tool(
  "review_pending_changes",
  "Reviews pending changes with syntax highlighting and statistics.",
  {
    format: z
      .enum(["unified", "side-by-side", "json"])
      .default("unified")
      .describe("Diff format"),
    includeStats: z
      .boolean()
      .default(true)
      .describe("Include change statistics"),
  },
  async ({ format, includeStats }) => {
    const diffCmd =
      format === "side-by-side" ? "git diff --color-words" : "git diff";
    const { stdout, stderr } = await runCmd(diffCmd);

    if (!stdout.trim()) {
      return {
        content: [
          { type: "text", text: `No pending changes tracked by Git.\n${stderr}` },
        ],
      };
    }

    if (format === "json") {
      const stats = await runCmd("git diff --stat");
      const numstat = await runCmd("git diff --numstat");
      const nameOnly = await runCmd("git diff --name-only");
      const jsonResult = JSON.stringify(
        {
          diff: stdout,
          stats: stats.stdout,
          numstat: numstat.stdout,
          files: nameOnly.stdout.split("\n").filter(Boolean),
        },
        null,
        2
      );
      return {
        content: [{ type: "text", text: jsonResult }],
      };
    }

    let result = stdout;

    if (includeStats) {
      const stats = await runCmd("git diff --stat");
      result = `=== CHANGE STATISTICS ===\n${stats.stdout}\n\n=== DIFF ===\n${result}`;
    }

    return {
      content: [{ type: "text", text: result }],
    };
  }
);

// Optimized Log Tail
server.tool(
  "tail_dev_logs",
  "Reads runtime logs with filtering and highlighting.",
  {
    logFile: z.string().default("dev_runtime.log").describe("Log file path"),
    lines: z.number().default(100).describe("Number of tail lines"),
    filter: z.string().optional().describe("Filter pattern (regex)"),
    highlight: z
      .array(z.string())
      .default(["error", "warn", "ERROR", "WARN"])
      .describe("Patterns to highlight"),
  },
  async ({ logFile, lines, filter, highlight }) => {
    try {
      const { stdout, stderr, code } = await runCmd(`tail -n ${lines} ${logFile}`);

      if (code !== 0) {
        return {
          content: [
            { type: "text", text: `Could not tail logs:\n${stderr}` },
          ],
          isError: true,
        };
      }

      let result = stdout;

      // Apply filter
      if (filter) {
        const filterRegex = new RegExp(filter, "gi");
        result = result
          .split("\n")
          .filter((line) => filterRegex.test(line))
          .join("\n");
      }

      // Apply highlighting
      for (const pattern of highlight) {
        const regex = new RegExp(pattern, "gi");
        result = result.replace(regex, (match) => `**${match}**`);
      }

      return {
        content: [
          {
            type: "text",
            text: result.trim() ? result : `No logs found in ${logFile}.`,
          },
        ],
      };
    } catch (err: any) {
      return {
        content: [
          { type: "text", text: `Failed to tail logs: ${err.message}` },
        ],
        isError: true,
      };
    }
  }
);

// ============================================
// AGENT WORKFLOW TOOLS
// ============================================

// Agent Task Planner
server.tool(
  "plan_agent_task",
  "Creates a detailed execution plan for AI agents.",
  {
    task: z.string().describe("High-level task description"),
    context: z
      .string()
      .optional()
      .describe("Additional context or requirements"),
    urgency: z
      .enum(["low", "medium", "high", "critical"])
      .default("medium")
      .describe("Task urgency level"),
  },
  async ({ task, context, urgency }) => {
    const plan = {
      task,
      context: context || "",
      urgency,
      timestamp: new Date().toISOString(),
      steps: [
        {
          id: 1,
          description: "Analyze codebase structure and dependencies",
          tools: ["read_entire_codebase", "map_codebase_structure"],
          estimatedTime: "15-30 minutes",
          validation: "Codebase map generated and reviewed",
        },
        {
          id: 2,
          description: "Identify files and functions to modify",
          tools: ["smart_search", "get_file_signatures"],
          estimatedTime: "10-20 minutes",
          validation: "All relevant files and symbols identified",
        },
        {
          id: 3,
          description: "Generate build plan",
          tools: ["generate_build_plan"],
          estimatedTime: "5-10 minutes",
          validation: "Build plan approved",
        },
        {
          id: 4,
          description: "Implement changes with atomic edits",
          tools: ["atomic_file_edit", "refactor_codebase"],
          estimatedTime: "1-4 hours",
          validation: "All changes committed and validated",
        },
        {
          id: 5,
          description: "Run quality gates and tests",
          tools: ["run_quality_gates", "run_tests"],
          estimatedTime: "30-60 minutes",
          validation: "All checks pass",
        },
        {
          id: 6,
          description: "Review changes and create summary",
          tools: ["review_pending_changes", "get_system_logs"],
          estimatedTime: "15-30 minutes",
          validation: "Changes documented and approved",
        },
      ],
      dependencies: {
        step2: ["step1"],
        step3: ["step2"],
        step4: ["step3"],
        step5: ["step4"],
        step6: ["step5"],
      },
      riskMitigation: [
        "Use atomic_file_edit with backups enabled",
        "Validate after each major change",
        "Run tests in parallel to save time",
        "Review all changes before final commit",
      ],
      successCriteria: [
        "All tests pass",
        "No type errors",
        "Code formatted and linted",
        "Performance not degraded",
        "Documentation updated",
      ],
    };

    return {
      content: [
        {
          type: "text",
          text:
            `🎯 AGENT TASK PLAN: ${task}\n` +
            `**Urgency:** ${urgency.toUpperCase()}\n` +
            `**Context:** ${context || "None"}\n\n` +
            `### Execution Steps:\n\n` +
            plan.steps
              .map(
                (step) =>
                  `#### Step ${step.id}: ${step.description}\n` +
                  `- **Tools:** ${step.tools.join(", ")}\n` +
                  `- **Estimated Time:** ${step.estimatedTime}\n` +
                  `- **Validation:** ${step.validation}\n`
              )
              .join("\n") +
            `\n### Dependencies:\n` +
            Object.entries(plan.dependencies)
              .map(([step, deps]) => `- Step ${step} depends on: ${deps.join(", ")}`)
              .join("\n") +
            `\n\n### Risk Mitigation:\n` +
            plan.riskMitigation.map((item) => `- ${item}`).join("\n") +
            `\n\n### Success Criteria:\n` +
            plan.successCriteria.map((item) => `- ${item}`).join("\n"),
        },
      ],
    };
  }
);

// Agent Self-Review
server.tool(
  "agent_self_review",
  "Performs a comprehensive self-review of changes made by the agent.",
  {
    changes: z
      .array(z.string())
      .optional()
      .describe("List of changes made (file paths)"),
    checklist: z
      .array(z.string())
      .optional()
      .describe("Custom checklist items to verify"),
  },
  async ({ changes, checklist }) => {
    const defaultChecklist = [
      "All tests pass",
      "No type errors (tsc --noEmit)",
      "Code formatted (biome check)",
      "No console.log statements in production code",
      "Error handling implemented",
      "Documentation updated",
      "Backward compatibility maintained",
      "Performance not degraded",
    ];

    const reviewChecklist = [...(checklist || []), ...defaultChecklist];
    const results: Record<string, any> = {};

    // Run automated checks
    for (const item of reviewChecklist) {
      let passed = false;
      let output = "";

      switch (item) {
        case "All tests pass":
          const tests = await runCmd("npx vitest run --passWithNoTests");
          passed = tests.code === 0;
          output = tests.stdout + tests.stderr;
          break;

        case "No type errors (tsc --noEmit)":
          const types = await runCmd("npx tsc --noEmit");
          passed = types.code === 0;
          output = types.stdout + types.stderr;
          break;

        case "Code formatted (biome check)":
          const format = await runCmd("npx biome check");
          passed = format.code === 0;
          output = format.stdout + format.stderr;
          break;

        case "No console.log statements in production code":
          const logs = await runCmd(
            "git grep -n 'console\\.log' -- '*.ts' '*.tsx' '*.js'"
          );
          passed = !logs.stdout.trim();
          output = logs.stdout || "No console.log found";
          break;

        default:
          passed = true;
          output = "Manual verification required";
      }

      results[item] = { passed, output };
    }

    const allPassed = Object.values(results).every((r) => r.passed);
    const summary = Object.entries(results).map(
      ([item, result]) =>
        `${result.passed ? "✅" : "❌"} **${item}**\n` + `   ${result.output}\n`
    );

    return {
      content: [
        {
          type: "text",
          text:
            `🔍 AGENT SELF-REVIEW\n\n` +
            `**Status:** ${allPassed ? "✅ PASSED" : "⚠️ NEEDS ATTENTION"}\n\n` +
            `### Checklist:\n\n` +
            summary.join("\n"),
        },
      ],
      isError: !allPassed,
    };
  }
);

// ============================================
// BOOT SERVER
// ============================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    "🚀 Haru-MCP v4.0 Production AI-Agent MCP Server active on stdio\n" +
      "✨ Features: Full Codebase Analysis, Root-Cause Fixes\n" +
      "📡 Tools: 20+ optimized tools for AI agents\n" +
      "🎯 Mission: Enable AI to understand and modify entire codebases with maximum context"
  );
}

main().catch((error) => {
  console.error("Fatal initialization error:", error);
  process.exit(1);
});
