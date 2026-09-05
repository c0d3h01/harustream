import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { z } from 'zod';
import { config, safePath } from '../config.js';
import { okStructured, okText, tool, toolError } from '../server.js';
import { READ_ONLY } from '../types.js';
import { mapLimit } from '../utils/concurrency.js';
import { renderJson } from '../utils/format.js';
import { readFileFull } from '../utils/fs.js';
import { globFiles } from '../utils/glob.js';
import {
  assertSafePattern,
  type GrepMatch,
  groupByFile,
  parseGrepLines,
  runGitGrep,
} from '../utils/grep.js';
import { paginate } from '../utils/pagination.js';

// ---------- shared grep types ----------

const GrepMatchOutput = z.object({
  file: z.string(),
  line: z.number(),
  content: z.string(),
});

// ---------- haru_read_codebase ----------

const ReadCodebaseInput = z
  .object({
    includePatterns: z
      .array(z.string())
      .default(['**/*.{ts,tsx,json,yaml,yml,md}'])
      .describe('Glob patterns to include (default: code + config files)'),
    excludePatterns: z
      .array(z.string())
      .default(['node_modules/**', '.next/**', 'dist/**', '.vercel/**', '**/*.lock'])
      .describe('Glob patterns to exclude (default: build outputs)'),
    maxFileSize: z
      .number()
      .int()
      .min(1)
      .max(50 * 1024 * 1024)
      .default(1024 * 1024)
      .describe('Per-file size cap in bytes (default 1 MiB)'),
  })
  .strict();

tool({
  name: 'haru_read_codebase',
  title: 'Read Entire Codebase',
  description: `Read multiple repository files in a single call, with deterministic ordering and a hard response budget.

Read-only. Prefer haru_search_codebase / haru_read_file for targeted probes; this tool exists for snapshot-style "show me everything" requests.

Args:
  - includePatterns (string[]): glob patterns (default: code + config)
  - excludePatterns (string[]): glob patterns to exclude
  - maxFileSize (number): per-file cap in bytes (default 1 MiB)

Returns (JSON text):
  {
    metadata: { totalFiles, totalSize, skipped, truncated, limits, timestamp },
    files: { "<path>": { path, content, lineCount, size, mtime, language } }
  }

Skips (rather than aborts) when a file exceeds the size or response budget.`,
  inputSchema: ReadCodebaseInput,
  annotations: READ_ONLY,
  callback: async ({ includePatterns, excludePatterns, maxFileSize }) => {
    try {
      for (const p of includePatterns) assertSafePattern(p, 'includePattern');
      for (const p of excludePatterns) assertSafePattern(p, 'excludePattern');

      const allFiles = await globFiles(includePatterns, excludePatterns);
      if (allFiles.length === 0) {
        return okText('No files matched the criteria.');
      }

      const capped = allFiles.slice(0, config.maxCodebaseFiles);
      let skipped = allFiles.length - capped.length;
      const results: Record<string, unknown> = {};
      let emittedBytes = 0;
      // Reserve the last 10% of the response budget for the JSON envelope.
      const budget = Math.floor(config.maxResponseBytes * 0.9);

      await mapLimit(capped, config.readConcurrency, async (file) => {
        if (emittedBytes >= budget) {
          skipped += 1;
          return;
        }
        try {
          const { content, lines, size, mtime } = await readFileFull(file);
          if (size > maxFileSize) {
            skipped += 1;
            return;
          }
          if (emittedBytes + size > budget) {
            skipped += 1;
            return;
          }
          emittedBytes += size;
          results[file] = {
            path: file,
            content,
            lineCount: lines.length,
            size,
            mtime: mtime.toISOString(),
            language: path.extname(file).replace(/^\./, ''),
          };
        } catch (err) {
          results[file] = {
            error: `Failed to read: ${err instanceof Error ? err.message : String(err)}`,
          };
        }
      });
      // mapLimit's mapped function mutates `results` and `skipped`; the return is void[].

      const totalSize = Object.values(results).reduce<number>(
        (sum, r) => sum + ((r as { size?: number }).size ?? 0),
        0,
      );

      const text = renderJson({
        metadata: {
          totalFiles: Object.keys(results).length,
          totalSize,
          skipped,
          truncated: skipped > 0,
          limits: {
            maxCodebaseFiles: config.maxCodebaseFiles,
            maxResponseMB: Math.round(config.maxResponseBytes / (1024 * 1024)),
          },
          timestamp: new Date().toISOString(),
        },
        files: results,
      });
      return okText(text);
    } catch (err) {
      return toolError(
        'failed to read codebase',
        `Details: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },
});

// ---------- haru_smart_search ----------

const SmartSearchInput = z
  .object({
    query: z.string().min(1).max(1024).describe('Search query (1-1024 chars)'),
    searchType: z
      .enum(['regex', 'symbol', 'fulltext'])
      .default('regex')
      .describe('regex = pattern, symbol = identifier, fulltext = case-insensitive phrase'),
    contextLines: z
      .number()
      .int()
      .min(0)
      .max(20)
      .default(3)
      .describe('Context lines before/after each match (0-20)'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .default(50)
      .describe('Max file-groups to return (1-200)'),
    offset: z.number().int().min(0).default(0).describe('Groups to skip for pagination'),
    responseFormat: z.enum(['markdown', 'json']).default('markdown').describe('Output format'),
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
    z.object({
      file: z.string(),
      count: z.number(),
      matches: z.array(GrepMatchOutput),
    }),
  ),
});

tool({
  name: 'haru_smart_search',
  title: 'Smart Codebase Search',
  description: `Search the codebase and return matches GROUPED BY FILE. Useful when you want one row per file with all match lines.

Read-only. Backed by git grep (includes untracked files).

Args:
  - query (string)
  - searchType ('regex' | 'symbol' | 'fulltext', default 'regex')
  - contextLines (0-20, default 3)
  - limit (1-200, default 50)
  - offset (default 0)
  - responseFormat ('markdown' | 'json', default 'markdown')

Returns: { total, count, offset, has_more, next_offset, search_type, groups: [{ file, count, matches: [{ file, line, content }] }] }`,
  inputSchema: SmartSearchInput,
  annotations: READ_ONLY,
  outputSchema: SmartSearchOutput,
  callback: async ({ query, searchType, contextLines, limit, offset, responseFormat }) => {
    try {
      assertSafePattern(query, 'query');
      const r = await runGitGrep({
        query,
        mode: searchType,
        contextLines,
        includeUntracked: true,
      });
      const empty = {
        total: 0,
        count: 0,
        offset,
        has_more: false,
        next_offset: null as number | null,
        search_type: searchType,
        groups: [] as { file: string; count: number; matches: GrepMatch[] }[],
      };
      if (r.code !== 0 && !r.stdout) {
        const text = `No matches found for '${query}' (${searchType}).${r.stderr ? `\n${r.stderr}` : ''}`;
        // Always include structuredContent because this tool declares an outputSchema;
        // the SDK requires it on every result.
        return okStructured(empty, responseFormat === 'json' ? renderJson(empty) : text);
      }
      const groups = groupByFile(parseGrepLines(r.stdout));
      const page = paginate(groups, limit, offset);
      const payload = {
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
          ? renderJson(payload)
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
      return okStructured(payload, text);
    } catch (err) {
      return toolError(
        'smart search failed',
        `Details: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },
});

// ---------- haru_search_codebase ----------

const SearchCodebaseInput = z
  .object({
    query: z.string().min(1).max(1024).describe('Exact string or regex pattern to find'),
    subpath: z.string().optional().describe("Restrict search to a subfolder, e.g. 'src/providers'"),
    caseSensitive: z.boolean().default(false).describe('Case-sensitive search (default false)'),
    limit: z.number().int().min(1).max(500).default(100).describe('Max matches to return (1-500)'),
    offset: z.number().int().min(0).default(0).describe('Number of matches to skip for pagination'),
    responseFormat: z.enum(['markdown', 'json']).default('markdown').describe('Output format'),
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
  description: `Fast regex/text search across the whole repo, including untracked files. Returns a flat list of file:line matches.

Read-only. Backed by git grep.

Args:
  - query (string): exact or regex pattern
  - subpath (string?): restrict to a folder
  - caseSensitive (bool, default false)
  - limit (1-500, default 100)
  - offset (default 0)
  - responseFormat ('markdown' | 'json', default 'markdown')

Returns: { total, count, offset, has_more, next_offset, matches: [{ file, line, content }] }`,
  inputSchema: SearchCodebaseInput,
  annotations: READ_ONLY,
  outputSchema: SearchCodebaseOutput,
  callback: async ({ query, subpath, caseSensitive, limit, offset, responseFormat }) => {
    try {
      assertSafePattern(query, 'query');
      const r = await runGitGrep({ query, mode: 'regex', subpath, caseSensitive });
      const empty = {
        total: 0,
        count: 0,
        offset,
        has_more: false,
        next_offset: null as number | null,
        matches: [] as GrepMatch[],
      };
      if (r.code !== 0 && !r.stdout) {
        const text = `No matches found for '${query}'.${r.stderr ? `\n${r.stderr}` : ''}`;
        // Always include structuredContent (outputSchema is declared).
        return okStructured(empty, responseFormat === 'json' ? renderJson(empty) : text);
      }
      const page = paginate(parseGrepLines(r.stdout), limit, offset);
      const payload = {
        total: page.total,
        count: page.count,
        offset,
        has_more: page.has_more,
        next_offset: page.next_offset ?? null,
        matches: page.items,
      };
      const text =
        responseFormat === 'json'
          ? renderJson(payload)
          : `# Matches for '${query}'${subpath ? ` in ${subpath}` : ''}\n` +
            `Found ${page.total} match${page.total === 1 ? '' : 'es'} (showing ${page.count})\n\n` +
            page.items.map((m) => `${m.file}:${m.line}: ${m.content}`).join('\n') +
            (page.has_more
              ? `\n\n...[${page.total - (offset + page.count)} more; use offset=${offset + page.count}]`
              : '');
      return okStructured(payload, text);
    } catch (err) {
      return toolError(
        'search failed',
        `Details: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },
});

// ---------- haru_read_file ----------

const ReadFileInput = z
  .object({
    filePath: z.string().min(1).max(4096).describe("Repo-relative path, e.g. 'src/app/page.tsx'"),
    startLine: z.number().int().min(1).default(1).describe('1-indexed start line (default 1)'),
    endLine: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Inclusive end line; defaults to end of file'),
    includeMetadata: z.boolean().default(false).describe('Include size/mtime/totalLines'),
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
  description: `Read a specific line window of a file inside the repository. Prevents context exhaustion by returning only the requested slice.

Read-only.

Args:
  - filePath (string): repo-relative path
  - startLine (number, default 1)
  - endLine (number?): inclusive; defaults to EOF
  - includeMetadata (bool, default false)

Returns: { filePath, startLine, endLine, totalLines, content, size?, mtime? }`,
  inputSchema: ReadFileInput,
  annotations: READ_ONLY,
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
      const payload: z.infer<typeof ReadFileOutput> = {
        filePath,
        startLine: start,
        endLine: end,
        totalLines: lines.length,
        content: slice.join('\n'),
        size: stats ? stats.size : null,
        mtime: stats ? stats.mtime.toISOString() : null,
      };
      const numberedText = slice.map((line, i) => `${start + i}: ${line}`).join('\n');
      const meta = includeMetadata
        ? `\n\n--- Metadata ---\nSize: ${stats?.size ?? 'n/a'} bytes\nModified: ${stats ? stats.mtime.toISOString() : 'n/a'}\nLines: ${lines.length}`
        : '';
      return okStructured(payload, numberedText + meta);
    } catch (err) {
      return toolError(
        `failed to read ${filePath}`,
        `Verify the path is repo-relative and inside the project root. Details: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },
});

// ---------- haru_get_file_signatures ----------

const GetFileSignaturesInput = z
  .object({
    filePath: z.string().min(1).max(4096).describe("Repo-relative path, e.g. 'src/lib/db.ts'"),
    includePrivate: z
      .boolean()
      .default(false)
      .describe('Include non-exported symbols (default false)'),
  })
  .strict();

const GetFileSignaturesOutput = z.object({
  filePath: z.string(),
  count: z.number(),
  include_private: z.boolean(),
  symbols: z.array(z.string()),
});

const SYMBOL_PATTERN =
  /^\s*(export\s+(?:default\s+)?)?(?:const|let|var|function|class|interface|type|enum)\s+([a-zA-Z_$][\w$]*)/gm;
const EXPORTED_ONLY =
  /^\s*export\s+(?:default\s+)?(?:const|let|var|function|class|interface|type|enum)\s+([a-zA-Z_$][\w$]*)/gm;
const RE_EXPORT = /export\s*(?:\*|\{[^}]*\})\s*(?:from\s*['"][^'"]+['"])?/g;

tool({
  name: 'haru_get_file_signatures',
  title: 'Get File Signatures',
  description: `Extract symbol names (functions, classes, interfaces, types, enums, constants) from a single file.

Read-only. By default only EXPORTED symbols are returned; set includePrivate=true to also include local declarations and re-export aliases.

Args:
  - filePath (string)
  - includePrivate (bool, default false)

Returns: { filePath, count, include_private, symbols: string[] }`,
  inputSchema: GetFileSignaturesInput,
  annotations: READ_ONLY,
  outputSchema: GetFileSignaturesOutput,
  callback: async ({ filePath, includePrivate }) => {
    try {
      const { content } = await readFileFull(filePath);
      const pattern = includePrivate ? SYMBOL_PATTERN : EXPORTED_ONLY;
      const names = new Set<string>();
      for (const m of content.matchAll(pattern)) {
        if (m[1]) names.add(m[1]);
      }
      // Re-exports: `export { a, b as c }` / `export * from 'x'`
      for (const m of content.matchAll(RE_EXPORT)) {
        const inside = m[0].match(/\{([^}]+)\}/);
        if (!inside) continue;
        for (const part of inside[1].split(',')) {
          const cleaned = part.trim();
          if (!cleaned) continue;
          const aliased = cleaned.split(/\s+as\s+/i);
          // In `a as b`, the exported name is `b`. If no `as`, it's `a`.
          const exported = (aliased[1] ?? aliased[0]).trim().split(/\s+/)[0];
          if (/^[a-zA-Z_$][\w$]*$/.test(exported)) names.add(exported);
          if (includePrivate && aliased[0]) {
            const local = aliased[0].trim();
            if (/^[a-zA-Z_$][\w$]*$/.test(local) && local !== exported) names.add(local);
          }
        }
      }
      const symbols = [...names].sort();
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
      return okStructured(payload, text);
    } catch (err) {
      return toolError(
        `failed to read ${filePath}`,
        `Verify the path is repo-relative and inside the project root. Details: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },
});
