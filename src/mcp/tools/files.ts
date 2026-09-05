import * as fs from 'node:fs/promises';
import { z } from 'zod';
import { config, safePath } from '../config.js';
import { okText, tool, toolError } from '../server.js';
import { WRITE_DESTRUCTIVE } from '../types.js';
import { runCmd } from '../utils/exec.js';
import { atomicWriteFile, backupFile, readFileFull } from '../utils/fs.js';
import { runGitGrep } from '../utils/grep.js';

function writesDisabled() {
  return toolError(
    'file writes are disabled',
    'Set MCP_ALLOW_FILE_WRITES=true to enable, or run the tool without write flags.',
  );
}

/**
 * Run `npx --no-install tsc --noEmit`. If the file is invalid, restore the
 * backup and return the diagnostic. Returns { ok: true } on success.
 */
async function tscCheckWithRevert(
  backupPath: string | null,
  fullPath: string,
): Promise<{ ok: boolean; error?: string }> {
  const r = await runCmd('npx --no-install tsc --noEmit', { timeout: 60_000 });
  if (r.code === 0) return { ok: true };
  if (backupPath) {
    await fs.copyFile(backupPath, fullPath).catch(() => {});
  }
  return { ok: false, error: `${r.stdout}${r.stderr}`.trim() };
}

// ---------- haru_edit_file ----------

const EditFileInput = z
  .object({
    filePath: z.string().min(1).max(4096).describe("Repo-relative path, e.g. 'src/lib/utils.ts'"),
    operation: z
      .enum(['replace', 'insert', 'delete', 'overwrite'])
      .describe(
        'replace: swap matched text; insert/delete: line ops; overwrite: replace whole file',
      ),
    search: z.string().optional().describe('Text to match (required for replace)'),
    replacement: z.string().optional().describe('New text (required for replace/insert)'),
    line: z.number().int().min(1).optional().describe('Target line (required for insert/delete)'),
    content: z.string().optional().describe('Full file content (required for overwrite)'),
    backup: z
      .boolean()
      .default(true)
      .describe('Create a .backup copy before editing (default true)'),
  })
  .strict();

tool({
  name: 'haru_edit_file',
  title: 'Edit File (Atomic)',
  description: `Atomically edit a repo file: replace matched text, insert a line, delete a line, or overwrite the whole file.

- Always writes to a temp file then renames into place.
- Optional backup is restored automatically if TypeScript validation fails afterwards.
- Respects MCP_ALLOW_FILE_WRITES.

Args:
  - filePath (string)
  - operation ('replace' | 'insert' | 'delete' | 'overwrite')
  - search (string?): required for 'replace'
  - replacement (string?): required for 'replace' and 'insert'
  - line (number?): 1-indexed, required for 'insert' and 'delete'
  - content (string?): required for 'overwrite'
  - backup (bool, default true)

Returns: human-readable result line.`,
  inputSchema: EditFileInput,
  annotations: WRITE_DESTRUCTIVE,
  callback: async ({ filePath, operation, search, replacement, line, content, backup }) => {
    if (!config.allowFileWrites) return writesDisabled();
    try {
      const fullPath = safePath(filePath, 'filePath');
      const backupPath = backup ? await backupFile(fullPath) : null;
      let result = '';

      switch (operation) {
        case 'replace': {
          if (search === undefined || replacement === undefined) {
            return toolError('search and replacement are required for the replace operation');
          }
          const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const { content: src } = await readFileFull(filePath);
          const occurrences = src.match(new RegExp(escaped, 'g'))?.length ?? 0;
          if (occurrences === 0) {
            return toolError(
              `no match for search text in ${filePath}`,
              'If the text is multi-line, pass the exact whitespace. Use haru_read_file to inspect.',
            );
          }
          const next = src.replace(new RegExp(escaped, 'g'), replacement);
          await atomicWriteFile(fullPath, next);
          result = `Replaced ${occurrences} occurrence(s) of '${search.slice(0, 60)}${search.length > 60 ? '…' : ''}'`;
          break;
        }
        case 'insert': {
          if (line === undefined || replacement === undefined) {
            return toolError('line and replacement are required for the insert operation');
          }
          const { lines } = await readFileFull(filePath);
          if (line > lines.length + 1) {
            return toolError(
              `line ${line} is past end of file (${lines.length} lines)`,
              'Use a line within the existing range, or operation=overwrite.',
            );
          }
          const next = [...lines];
          next.splice(line - 1, 0, replacement);
          await atomicWriteFile(fullPath, next.join('\n'));
          result = `Inserted line at position ${line}`;
          break;
        }
        case 'delete': {
          if (line === undefined) return toolError('line is required for the delete operation');
          const { lines } = await readFileFull(filePath);
          if (line < 1 || line > lines.length) {
            return toolError(`line ${line} out of range (1..${lines.length})`);
          }
          const next = [...lines];
          next.splice(line - 1, 1);
          await atomicWriteFile(fullPath, next.join('\n'));
          result = `Deleted line ${line}`;
          break;
        }
        case 'overwrite': {
          if (content === undefined)
            return toolError('content is required for the overwrite operation');
          await atomicWriteFile(fullPath, content);
          result = `Overwrote ${filePath} (${content.split('\n').length} lines)`;
          break;
        }
      }

      if (/\.tsx?$/.test(filePath)) {
        const v = await tscCheckWithRevert(backupPath, fullPath);
        if (!v.ok) {
          return toolError(
            `TypeScript validation failed after edit; ${backupPath ? 'change reverted' : 'no backup to restore'}.`,
            v.error,
          );
        }
      }
      return okText(`Ok: ${result}`);
    } catch (err) {
      return toolError(
        `failed to edit ${filePath}`,
        `Details: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },
});

// ---------- haru_write_file ----------

const WriteFileInput = z
  .object({
    filePath: z
      .string()
      .min(1)
      .max(4096)
      .describe("Repo-relative path, e.g. 'src/lib/constants.ts'"),
    content: z.string().describe('Complete file content to write'),
    backup: z
      .boolean()
      .default(true)
      .describe('Create a .backup copy before writing (default true)'),
    validate: z
      .boolean()
      .default(true)
      .describe('Run `tsc --noEmit` after .ts/.tsx writes; revert on failure (default true)'),
  })
  .strict();

tool({
  name: 'haru_write_file',
  title: 'Write File',
  description: `Create or overwrite a file atomically (tmp + rename), with optional backup and optional TypeScript validation that reverts on failure.

Respects MCP_ALLOW_FILE_WRITES.

Args:
  - filePath (string)
  - content (string)
  - backup (bool, default true)
  - validate (bool, default true)

Returns: "Ok: wrote N lines to <path>"`,
  inputSchema: WriteFileInput,
  annotations: WRITE_DESTRUCTIVE,
  callback: async ({ filePath, content, backup, validate }) => {
    if (!config.allowFileWrites) return writesDisabled();
    try {
      const fullPath = safePath(filePath, 'filePath');
      const backupPath = backup ? await backupFile(fullPath) : null;
      await atomicWriteFile(fullPath, content);
      if (validate && /\.tsx?$/.test(filePath)) {
        const v = await tscCheckWithRevert(backupPath, fullPath);
        if (!v.ok) {
          return toolError(
            `TypeScript validation failed; ${backupPath ? 'change reverted' : 'no backup to restore'}.`,
            v.error,
          );
        }
      }
      return okText(`Ok: wrote ${content.split('\n').length} lines to ${filePath}`);
    } catch (err) {
      return toolError(
        `failed to write ${filePath}`,
        `Details: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },
});

// ---------- haru_refactor_codebase ----------

const RefactorChange = z
  .object({
    type: z.enum(['rename', 'move', 'extract', 'inline']).describe('Kind of refactor'),
    target: z.string().describe('Symbol, import path, or const name to operate on'),
    newValue: z.string().optional().describe('Replacement value (rename/move)'),
    files: z.array(z.string()).optional().describe('Restrict to these files (default: git grep)'),
  })
  .strict();

const RefactorInput = z
  .object({
    changes: z.array(RefactorChange).min(1).describe('Refactor operations to apply'),
    dryRun: z.boolean().default(true).describe('Preview only (default true)'),
  })
  .strict();

const REGEX_META = /[.*+?^${}()|[\]\\]/g;
const escRe = (s: string) => s.replace(REGEX_META, '\\$&');

tool({
  name: 'haru_refactor_codebase',
  title: 'Refactor Codebase',
  description: `Apply mechanical refactors (rename, move, extract, inline) across the codebase. Defaults to dryRun=true so you can preview before writing.

Mutating when dryRun=false. Respects MCP_ALLOW_FILE_WRITES.

Args:
  - changes (array of { type, target, newValue?, files? }):
      - 'rename': rewrite all \`target\` identifiers and string references to \`newValue\`
      - 'move': rewrite \`import ... from 'target'\` to \`newValue\`
      - 'extract': turn \`const target = X;\` into \`export const target = X;\`
      - 'inline': replace every \`target\` with the value of \`const target = VALUE;\` in the file
  - dryRun (bool, default true)

Returns: per-file preview + summary.`,
  inputSchema: RefactorInput,
  annotations: WRITE_DESTRUCTIVE,
  callback: async ({ changes, dryRun }) => {
    if (!dryRun && !config.allowFileWrites) return writesDisabled();
    try {
      type ApplyResult = {
        content: string;
        changed: boolean;
      };

      const apply = (
        _filePath: string,
        content: string,
        change: z.infer<typeof RefactorChange>,
      ): ApplyResult => {
        const target = change.target;
        const escT = escRe(target);
        let next = content;
        switch (change.type) {
          case 'rename': {
            if (!change.newValue) return { content, changed: false };
            // Identifier occurrences (word boundary).
            next = next.replace(new RegExp(`\\b${escT}\\b`, 'g'), change.newValue);
            // String / import-path occurrences.
            next = next.replace(new RegExp(`(['"\`])${escT}\\1`, 'g'), `$1${change.newValue}$1`);
            break;
          }
          case 'move': {
            if (!change.newValue) return { content, changed: false };
            // `from "x"` and `from 'x'` (used by ES module imports).
            next = next.replace(
              new RegExp(`from\\s+(['"\`])${escT}\\1`, 'g'),
              `from $1${change.newValue}$1`,
            );
            // `require("x")` for CJS.
            next = next.replace(
              new RegExp(`require\\(\\s*(['"\`])${escT}\\1\\s*\\)`, 'g'),
              `require($1${change.newValue}$1)`,
            );
            break;
          }
          case 'extract': {
            // `const target = X;` -> `export const target = X;` (only on declarations
            // that aren't already exported).
            next = next.replace(
              new RegExp(`(^|\\n)([ \\t]*)const\\s+${escT}\\s*=`, 'g'),
              `$1$2export const ${target} =`,
            );
            break;
          }
          case 'inline': {
            // Find the first `const target = VALUE;` in the file and replace every
            // identifier occurrence with VALUE.
            const decl = content.match(new RegExp(`\\bconst\\s+${escT}\\s*=\\s*([^;]+);`));
            if (!decl) return { content, changed: false };
            const value = decl[1].trim();
            next = content.replace(new RegExp(`\\b${escT}\\b`, 'g'), value);
            break;
          }
        }
        return { content: next, changed: next !== content };
      };

      const results: {
        file: string;
        type: string;
        from: string;
        to: string;
        preview: string;
        changed: boolean;
      }[] = [];
      const errors: { file: string; error: string }[] = [];

      for (const change of changes) {
        let filesToTouch: string[];
        if (change.files?.length) {
          filesToTouch = change.files;
        } else {
          // Find candidate files cheaply. For move, look for `from "target"`.
          // For everything else, just look for the literal target.
          const search =
            change.type === 'move' ? `from ['"\`]${change.target}['"\`]` : change.target;
          const r = await runGitGrep({ query: search, mode: 'plain', filesOnly: true });
          filesToTouch = r.stdout.split('\n').filter(Boolean);
          if (filesToTouch.length === 0) {
            errors.push({ file: '-', error: `No files contain '${change.target}'` });
            continue;
          }
        }
        for (const file of filesToTouch) {
          try {
            const { content } = await readFileFull(file);
            const { content: next, changed } = apply(file, content, change);
            if (dryRun) {
              results.push({
                file,
                type: change.type,
                from: change.target,
                to: change.newValue ?? '',
                preview: changed
                  ? `${next.slice(0, 200)}${next.length > 200 ? '…' : ''}`
                  : 'No changes',
                changed,
              });
            } else {
              if (changed) await atomicWriteFile(safePath(file, 'file'), next);
              results.push({
                file,
                type: change.type,
                from: change.target,
                to: change.newValue ?? '',
                preview: changed ? 'applied' : 'No changes',
                changed,
              });
            }
          } catch (err) {
            errors.push({
              file,
              error: `Failed to refactor: ${err instanceof Error ? err.message : String(err)}`,
            });
          }
        }
      }

      const filesAffected = new Set(results.filter((r) => r.changed).map((r) => r.file)).size;
      const changedCount = results.filter((r) => r.changed).length;
      const body =
        results
          .map(
            (r) =>
              `**${r.file}** (${r.changed ? 'changed' : 'unchanged'})\n   ${r.type}: ${r.from}${r.to ? ` -> ${r.to}` : ''}\n   Preview: ${r.preview}\n`,
          )
          .join('\n') +
        (errors.length
          ? `\n${errors.map((e) => `**${e.file}** error: ${e.error}`).join('\n')}`
          : '');
      const text =
        `${dryRun ? '[DRY RUN] ' : 'Ok: '}Refactor Summary\n\n` +
        `**Files Affected:** ${filesAffected}\n` +
        `**Changes Applied:** ${changedCount}\n\n${body}`;
      return okText(text);
    } catch (err) {
      return toolError(
        'refactoring failed',
        `Details: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },
});
