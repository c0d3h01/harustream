import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { z } from 'zod';
import {
  buildDependencyGraph,
  config,
  esc,
  paginate,
  type ResponseFormat,
  readFileFull,
  runCmd,
  safePath,
  tool,
  toolError,
} from './core.js';

// ============================================
// CODEBASE ANALYSIS TOOLS (READ-ONLY)
// ============================================

/** Only ASCII + glob metacharacters are allowed in find/grep patterns. */
const SAFE_PATTERN = /^[A-Za-z0-9_\-/.*[\]{}!@+, ]+$/;

function assertSafePattern(pattern: string, label: string): void {
  if (pattern.length === 0 || pattern.length > 1024) {
    throw new Error(`${label} must be 1-1024 characters`);
  }
  if (pattern.includes('..')) {
    throw new Error(`${label} must not contain '..': ${pattern}`);
  }
  if (!SAFE_PATTERN.test(pattern)) {
    throw new Error(`${label} contains unsafe characters: ${pattern}`);
  }
}

const READ_ONLY_HINTS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

/** Output schema shared by the two grep-based search tools. */
const GrepMatchOutput = z.object({
  file: z.string(),
  line: z.number(),
  content: z.string(),
});

// ------------------------------------------------------------
// haru_read_codebase
// ------------------------------------------------------------

const ReadCodebaseInput = z
  .object({
    includePatterns: z
      .array(z.string())
      .default(['**/*.{ts,tsx,json,yaml,yml}'])
      .describe('Glob patterns to include'),
    excludePatterns: z
      .array(z.string())
      .default(['node_modules/**', '.next/**', 'dist/**', '.vercel/**', '**/*.lock'])
      .describe('Glob patterns to exclude'),
    maxFileSize: z
      .number()
      .int()
      .min(1)
      .max(50 * 1024 * 1024)
      .default(1024 * 1024)
      .describe('Maximum file size in bytes to include'),
  })
  .strict();

tool({
  name: 'haru_read_codebase',
  title: 'Read Entire Codebase',
  description: `Read and structure the ENTIRE codebase for AI analysis: metadata, per-file content with line counts, and a dependency graph.

Read-only: never modifies files. Expensive: prefer haru_search_codebase / haru_read_file for targeted probes.

Args:
  - includePatterns (string[]): glob patterns to include (default: ['**/*.{ts,tsx,json,yaml,yml}'])
  - excludePatterns (string[]): glob patterns to exclude (default: ['node_modules/**','.next/**','dist/**','.vercel/**','**/*.lock'])
  - maxFileSize (number): maximum file size in bytes to include (default: 1048576)

Returns:
  JSON text: { metadata: { totalFiles, totalSize, skipped, truncated, configLimit, timestamp }, files: { <path>: { path, content, lineCount, size, mtime, language } }, dependencies: { files: <import graph>, rootFiles } }

Examples:
  - Use when: "Show me every TypeScript file and how they import each other" -> defaults
  - Use when: "Analyze only the src/providers folder" -> includePatterns=["src/providers/**/*.ts"]
  - Don't use when: you only need one file (use haru_read_file)

Error Handling:
  - Returns num matches/no files message if nothing matches
  - Response is budget-capped; check metadata.skipped/truncated if output seems short`,
  inputSchema: ReadCodebaseInput,
  annotations: READ_ONLY_HINTS,
  callback: async ({ includePatterns, excludePatterns, maxFileSize }) => {
    try {
      const expandBraces = (pattern: string): string[] => {
        const braceMatch = pattern.match(/\{([^}]+)\}/);
        if (!braceMatch) return [pattern];
        const full = braceMatch[0];
        const inner = braceMatch[1];
        const options = inner.split(',').map((s) => s.trim());
        return options.map((opt) => pattern.replace(full, opt));
      };

      const expandedIncludes = includePatterns.flatMap(expandBraces);
      for (const p of expandedIncludes) assertSafePattern(p, 'includePattern');
      const includeNames = expandedIncludes.map((p) => p.split('/').pop() || p);
      const includeArgs = includeNames.map((n) => `-name ${esc(n)}`).join(' -o ');

      const expandedExcludes = excludePatterns.flatMap(expandBraces);
      for (const p of expandedExcludes) assertSafePattern(p, 'excludePattern');
      const excludeParts: string[] = [];
      for (const pat of expandedExcludes) {
        if (pat.endsWith('/**')) {
          const dir = pat.slice(0, -3).replace(/^\*\*\//, '');
          excludeParts.push(`! -path ${esc(`*/${dir}/*`)}`);
          excludeParts.push(`! -path ${esc(`*/${dir}`)}`);
        } else if (pat.startsWith('**/')) {
          excludeParts.push(`! -name ${esc(pat.slice(3))}`);
        } else if (pat.includes('*')) {
          if (pat.includes('/')) {
            const normalized = pat.replace(/^\*\*\//, '').replace(/\/\*\*$/, '/*');
            excludeParts.push(`! -path ${esc(`*/${normalized}`)}`);
          } else {
            excludeParts.push(`! -name ${esc(pat)}`);
          }
        } else {
          excludeParts.push(`! -path ${esc(`*/${pat}/*`)}`);
          excludeParts.push(`! -path ${esc(`*/${pat}`)}`);
        }
      }
      const excludeArgs = excludeParts.join(' ');

      const filesResult = await runCmd(
        `find . -type f \\( ${includeArgs} \\) ${excludeArgs} -size -${maxFileSize}c 2>/dev/null`,
      );

      if (!filesResult.stdout.trim()) {
        return { content: [{ type: 'text', text: 'No files matched the criteria.' }] };
      }

      const files = filesResult.stdout.split('\n').filter(Boolean);
      const results: Record<string, any> = {};

      const budgetBytes = Math.floor(config.maxResponseBytes * 0.9);
      let emittedBytes = 0;
      let skippedFiles = 0;

      const concurrency = config.readConcurrency;
      for (let i = 0; i < files.length && emittedBytes < budgetBytes; i += concurrency) {
        const batch = files.slice(i, i + concurrency);
        await Promise.all(
          batch.map(async (file) => {
            try {
              const { content, lines, stats } = await readFileFull(file);
              if (emittedBytes + stats.size > budgetBytes) {
                skippedFiles += 1;
                return;
              }
              emittedBytes += stats.size;
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
          }),
        );
      }

      if (files.length > config.maxCodebaseFiles) {
        skippedFiles += files.length - config.maxCodebaseFiles;
      }

      const graph = await buildDependencyGraph();

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                metadata: {
                  totalFiles: Object.keys(results).length,
                  totalSize: Object.values(results)
                    .filter((r: any) => !r.error)
                    .reduce((sum: number, r: any) => sum + r.size, 0),
                  skipped: skippedFiles,
                  truncated: skippedFiles > 0,
                  configLimit: {
                    maxCodebaseFiles: config.maxCodebaseFiles,
                    maxResponseMB: Math.round(config.maxResponseBytes / (1024 * 1024)),
                  },
                  timestamp: new Date().toISOString(),
                },
                files: results,
                dependencies: graph,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (err) {
      return toolError(
        'failed to read codebase',
        `Details: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },
});

// ------------------------------------------------------------
// haru_smart_search
// ------------------------------------------------------------

const SmartSearchInput = z
  .object({
    query: z
      .string()
      .min(1)
      .max(1024)
      .describe('Search query (regex, symbol name, or fulltext phrase)'),
    searchType: z
      .enum(['regex', 'symbol', 'fulltext'])
      .default('regex')
      .describe('regex = pattern, symbol = definition sites, fulltext = case-insensitive phrase'),
    contextLines: z
      .number()
      .int()
      .min(0)
      .max(20)
      .default(3)
      .describe('Context lines around each match'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .default(100)
      .describe('Maximum groups (files) to return'),
    offset: z.number().int().min(0).default(0).describe('Number of groups to skip for pagination'),
    responseFormat: z
      .enum(['markdown', 'json'])
      .default('markdown')
      .describe("Output format: 'markdown' (human-readable) or 'json' (machine-readable)"),
  })
  .strict();

const SmartSearchOutput = z.object({
  total: z.number(),
  count: z.number(),
  offset: z.number(),
  has_more: z.boolean(),
  next_offset: z.number().nullable(),
  search_type: z.enum(['regex', 'symbol', 'fulltext']),
  groups: z.array(
    z.object({ file: z.string(), count: z.number(), matches: z.array(GrepMatchOutput) }),
  ),
});

tool({
  name: 'haru_smart_search',
  title: 'Smart Codebase Search',
  description: `Search across the codebase with regex, symbol, or full-text matching, grouped by file with context lines.

Read-only. Performs git grep against the repository (includes untracked files).

Args:
  - query (string): the pattern to find (1-1024 chars)
  - searchType ('regex'|'symbol'|'fulltext'): regex = literal pattern, symbol = definition sites only, fulltext = case-insensitive phrase (default: 'regex')
  - contextLines (number): context lines before/after each match, 0-20 (default: 3)
  - limit (number): max groups (files) to return, 1-200 (default: 100)
  - offset (number): groups to skip for pagination (default: 0)
  - responseFormat ('markdown'|'json'): output style (default: 'markdown')

Returns:
  For json: { total, count, offset, has_more, next_offset, search_type, groups: [{ file, count, matches: [{ file, line, content }] }] }

Examples:
  - Use when: "Find every place fetch() is called" -> query="fetch\\(", searchType="regex"
  - Use when: "Where is dbConnect defined?" -> query="dbConnect", searchType="symbol"
  - Use when: "Find /tmp references case-insensitively" -> query="\\/tmp", searchType="regex"

Error Handling:
  - No matches -> empty success result (total: 0), not an error
  - Returns Error: query contains unsafe characters if the pattern is rejected`,
  inputSchema: SmartSearchInput,
  annotations: READ_ONLY_HINTS,
  outputSchema: SmartSearchOutput,
  callback: async ({ query, searchType, contextLines, limit, offset, responseFormat }) => {
    try {
      assertSafePattern(query, 'query');

      let command: string;
      switch (searchType) {
        case 'regex':
          command = `git grep -n -I -E --untracked -A ${contextLines} -B ${contextLines} ${esc(query)}`;
          break;
        case 'symbol':
          command = `git grep -n -I -E --untracked ${esc(`(export|const|function|class|interface|type|let)[[:space:]]+${query}`)}`;
          break;
        case 'fulltext':
          command = `git grep -n -I -i --untracked -A ${contextLines} ${esc(query)}`;
          break;
        default:
          command = `git grep -n -I --untracked ${esc(query)}`;
      }

      const { stdout, stderr, code } = await runCmd(command);
      if (code !== 0 && !stdout) {
        const empty: z.infer<typeof SmartSearchOutput> = {
          total: 0,
          count: 0,
          offset,
          has_more: false,
          next_offset: null,
          search_type: searchType,
          groups: [],
        };
        const text = `No matches found for '${query}' (${searchType}).${stderr ? `\n${stderr}` : ''}`;
        return {
          content: [
            {
              type: 'text',
              text: responseFormat === 'json' ? JSON.stringify(empty, null, 2) : text,
            },
          ],
          structuredContent: empty as Record<string, unknown>,
        };
      }

      const lines = stdout.split('\n').filter(Boolean);
      const resultsByFile: Record<string, z.infer<typeof GrepMatchOutput>[]> = {};
      for (const line of lines) {
        const match = line.match(/^([^:]+):(\d+):(.*)$/);
        if (match) {
          const [, file, lineNum, content] = match;
          if (!resultsByFile[file]) resultsByFile[file] = [];
          resultsByFile[file].push({ file, line: parseInt(lineNum, 10), content });
        }
      }

      const groups = Object.entries(resultsByFile).map(([file, matches]) => ({
        file,
        matches,
        count: matches.length,
      }));
      const page = paginate(groups, limit, offset);

      const payload: z.infer<typeof SmartSearchOutput> = {
        total: page.total,
        count: page.count,
        offset,
        has_more: page.has_more,
        next_offset: page.next_offset ?? null,
        search_type: searchType,
        groups: page.items,
      };

      const text =
        responseFormat === 'json'
          ? JSON.stringify(payload, null, 2)
          : `# Matches for '${query}' (${searchType})\n` +
            `Found ${page.total} file${page.total === 1 ? '' : 's'} (showing ${page.count})\n\n` +
            page.items
              .map(
                (g) =>
                  `## ${g.file} (${g.count} matches)\n` +
                  g.matches.map((m) => `- **${m.line}**: ${m.content}`).join('\n'),
              )
              .join('\n\n') +
            (page.has_more
              ? `\n\n...[${page.total - (offset + page.count)} more groups; use offset=${offset + page.count}]`
              : '');

      return {
        content: [{ type: 'text', text }],
        structuredContent: payload as Record<string, unknown>,
      };
    } catch (err) {
      return toolError(
        'smart search failed',
        `Details: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },
});

// ------------------------------------------------------------
// haru_search_codebase
// ------------------------------------------------------------

const SearchCodebaseInput = z
  .object({
    query: z.string().min(1).max(1024).describe('Exact string or regex pattern to find'),
    subpath: z.string().optional().describe("Restrict search to a subfolder, e.g. 'src/providers'"),
    caseSensitive: z.boolean().default(false).describe('Case-sensitive search (default: false)'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(500)
      .default(100)
      .describe('Max matches to return, 1-500 (default: 100)'),
    offset: z
      .number()
      .int()
      .min(0)
      .default(0)
      .describe('Number of matches to skip for pagination (default: 0)'),
    responseFormat: z
      .enum(['markdown', 'json'])
      .default('markdown')
      .describe("Output format: 'markdown' (human-readable) or 'json' (machine-readable)"),
  })
  .strict();

const SearchCodebaseOutput = z.object({
  total: z.number(),
  count: z.number(),
  offset: z.number(),
  has_more: z.boolean(),
  next_offset: z.number().nullable(),
  matches: z.array(GrepMatchOutput),
});

tool({
  name: 'haru_search_codebase',
  title: 'Fast Codebase Search',
  description: `Extremely fast regex/text search across the entire codebase, including untracked files, paginated per-match.

Read-only. Backed by git grep; all matches are parsed into file:line slices so the response is compact and pageable.

Args:
  - query (string): exact string or regex pattern (1-1024 chars)
  - subpath (string?): restrict to a subfolder, e.g. 'src/providers'
  - caseSensitive (boolean): default false
  - limit (number): max matches returned, 1-500 (default: 100)
  - offset (number): matches to skip for pagination
  - responseFormat ('markdown'|'json'): output style (default: 'markdown')

Returns:
  For json: { total, count, offset, has_more, next_offset, matches: [{ file, line, content }] }

Examples:
  - Use when: "Find every usage of buildDependencyGraph" -> query="buildDependencyGraph"
  - Use when: "Case-sensitive references to SHARD_COUNT in lib/" -> query="SHARD_COUNT", subpath="lib", caseSensitive=true

Error Handling:
  - No matches -> empty success result (total: 0)
  - Returns Error: query contains unsafe characters if the pattern is rejected`,
  inputSchema: SearchCodebaseInput,
  annotations: READ_ONLY_HINTS,
  outputSchema: SearchCodebaseOutput,
  callback: async ({ query, subpath, caseSensitive, limit, offset, responseFormat }) => {
    try {
      assertSafePattern(query, 'query');
      const target = subpath ? ` -- ${esc(subpath)}` : '';
      const caseFlag = caseSensitive ? '' : '-i';

      const { stdout, stderr, code } = await runCmd(
        `git grep -n -I ${caseFlag} --untracked ${esc(query)}${target}`,
      );

      if (code !== 0 && !stdout) {
        const empty: z.infer<typeof SearchCodebaseOutput> = {
          total: 0,
          count: 0,
          offset,
          has_more: false,
          next_offset: null,
          matches: [],
        };
        const text = `No matches found for '${query}'.${stderr ? `\n${stderr}` : ''}`;
        return {
          content: [
            {
              type: 'text',
              text: responseFormat === 'json' ? JSON.stringify(empty, null, 2) : text,
            },
          ],
          structuredContent: empty as Record<string, unknown>,
        };
      }

      const matches: z.infer<typeof GrepMatchOutput>[] = [];
      for (const line of stdout.split('\n').filter(Boolean)) {
        const match = line.match(/^([^:]+):(\d+):(.*)$/);
        if (match) {
          const [, file, lineNum, content] = match;
          matches.push({ file, line: parseInt(lineNum, 10), content });
        }
      }

      const page = paginate(matches, limit, offset);
      const payload: z.infer<typeof SearchCodebaseOutput> = {
        total: page.total,
        count: page.count,
        offset,
        has_more: page.has_more,
        next_offset: page.next_offset ?? null,
        matches: page.items,
      };

      const text =
        responseFormat === 'json'
          ? JSON.stringify(payload, null, 2)
          : `# Matches for '${query}'${subpath ? ` in ${subpath}` : ''}\n` +
            `Found ${page.total} match${page.total === 1 ? '' : 'es'} (showing ${page.count})\n\n` +
            page.items.map((m) => `${m.file}:${m.line}: ${m.content}`).join('\n') +
            (page.has_more
              ? `\n\n...[${page.total - (offset + page.count)} more; use offset=${offset + page.count}]`
              : '');

      return {
        content: [{ type: 'text', text }],
        structuredContent: payload as Record<string, unknown>,
      };
    } catch (err) {
      return toolError(
        'search failed',
        `Details: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },
});

// ------------------------------------------------------------
// haru_read_file
// ------------------------------------------------------------

const ReadFileInput = z
  .object({
    filePath: z
      .string()
      .min(1)
      .max(4096)
      .describe("Relative path to file (e.g. 'src/app/page.tsx')"),
    startLine: z.number().int().min(1).default(1).describe('1-indexed starting line (default: 1)'),
    endLine: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Ending line (inclusive); defaults to end of file'),
    includeMetadata: z
      .boolean()
      .default(false)
      .describe('Include file metadata (size, mtime, lines)'),
  })
  .strict();

const ReadFileOutput = z.object({
  filePath: z.string(),
  startLine: z.number(),
  endLine: z.number(),
  totalLines: z.number(),
  content: z.string(),
  size: z.number().nullable(),
  mtime: z.string().nullable(),
});

tool({
  name: 'haru_read_file',
  title: 'Read File Lines',
  description: `Read a specific line range from a file inside the repository, optionally with metadata. Prevents context exhaustion by returning only the requested window.

Read-only.

Args:
  - filePath (string): repo-relative path, e.g. 'src/app/page.tsx'
  - startLine (number): 1-indexed start line (default: 1)
  - endLine (number?): last line inclusive; unset = end of file
  - includeMetadata (boolean): include size/mtime/total lines (default: false)

Returns:
  For json option: { filePath, startLine, endLine, totalLines, content, size, mtime }
  Text form is "line: content" lines with optional metadata trailer.

Examples:
  - Use when: "Show me lines 40-70 of src/providers/vega/stream.ts" -> filePath, startLine=40, endLine=70
  - Use when: "What does package.json scripts say?" -> filePath="package.json"

Error Handling:
  - Returns Error with path-traversal guidance if filePath leaves the project root
  - Returns Error: Failed to read <file> if the file does not exist or is unreadable`,
  inputSchema: ReadFileInput,
  annotations: READ_ONLY_HINTS,
  outputSchema: ReadFileOutput,
  callback: async ({ filePath, startLine = 1, endLine, includeMetadata }) => {
    try {
      const fullPath = safePath(filePath, 'filePath');
      const [raw, stats] = await Promise.all([
        fs.readFile(fullPath, 'utf-8'),
        includeMetadata ? fs.stat(fullPath) : Promise.resolve(null),
      ]);

      const lines = raw.split('\n');
      const start = Math.max(1, startLine);
      const end = endLine ? Math.min(endLine, lines.length) : lines.length;

      const slice = lines.slice(start - 1, end);
      const output = slice.map((line: string, idx: number) => `${start + idx}: ${line}`).join('\n');

      const payload: z.infer<typeof ReadFileOutput> = {
        filePath,
        startLine: start,
        endLine: end,
        totalLines: lines.length,
        content: slice.join('\n'),
        size: stats ? stats.size : null,
        mtime: stats ? stats.mtime.toISOString() : null,
      };

      const metadata = includeMetadata
        ? `\n\n--- Metadata ---\n` +
          `Size: ${stats?.size ?? 'n/a'} bytes\n` +
          `Modified: ${stats ? stats.mtime.toISOString() : 'n/a'}\n` +
          `Lines: ${lines.length}`
        : '';

      return {
        content: [{ type: 'text', text: output + metadata }],
        structuredContent: payload as Record<string, unknown>,
      };
    } catch (err) {
      return toolError(
        `failed to read ${filePath}`,
        `Verify the path is repo-relative and inside the project root. Details: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },
});

// ------------------------------------------------------------
// haru_get_file_signatures
// ------------------------------------------------------------

const GetFileSignaturesInput = z
  .object({
    filePath: z
      .string()
      .min(1)
      .max(4096)
      .describe("Repo-relative path to the file to map, e.g. 'src/lib/db.ts'"),
    includePrivate: z
      .boolean()
      .default(false)
      .describe('Include private/non-exported symbols (default: false)'),
  })
  .strict();

const GetFileSignaturesOutput = z.object({
  filePath: z.string(),
  count: z.number(),
  include_private: z.boolean(),
  symbols: z.array(z.string()),
});

tool({
  name: 'haru_get_file_signatures',
  title: 'Get File Signatures',
  description: `Extract exported (or all) symbols — functions, classes, interfaces, types, enums, constants — from a single file.

Read-only.

Args:
  - filePath (string): repo-relative path to the file to map
  - includePrivate (boolean): include non-exported declarations too (default: false)

Returns:
  { filePath, count, include_private, symbols: string[] }
  Text form lists one symbol per line.

Examples:
  - Use when: "What does src/providers/vega/stream.ts export?" -> filePath="src/providers/vega/stream.ts"
  - Use when: "List every local helper in core.ts" -> filePath="src/mcp/core.ts", includePrivate=true

Error Handling:
  - Returns Error: failed to read <file> if the file is missing or outside the project root`,
  inputSchema: GetFileSignaturesInput,
  annotations: READ_ONLY_HINTS,
  outputSchema: GetFileSignaturesOutput,
  callback: async ({ filePath, includePrivate }) => {
    try {
      const { content } = await readFileFull(filePath);

      const pattern = includePrivate
        ? /^[\s]*(?:export\s+)?(?:const|let|var|function|class|interface|type|enum)\s+([a-zA-Z_$][\w$]*)/gm
        : /^[\s]*(?:export\s+)(?:const|let|var|function|class|interface|type|enum)\s+([a-zA-Z_$][\w$]*)/gm;

      const symbols = [...new Set(content.match(pattern) || [])];

      const payload: z.infer<typeof GetFileSignaturesOutput> = {
        filePath,
        count: symbols.length,
        include_private: includePrivate,
        symbols,
      };

      const text =
        symbols.length === 0
          ? `No ${includePrivate ? '' : 'exported '}symbols found in ${filePath}`
          : `Symbols in ${filePath}:\n\n${symbols.join('\n')} (${symbols.length})`;

      return {
        content: [{ type: 'text', text }],
        structuredContent: payload as Record<string, unknown>,
      };
    } catch (err) {
      return toolError(
        `failed to read ${filePath}`,
        `Verify the path is repo-relative and inside the project root. Details: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },
});
