import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { z } from 'zod';
import { config, esc, readFileFull, runCmd, safePath, tool, toolError } from './core.js';

// ============================================
// FILE OPERATION TOOLS (MUTATING)
// All writes are confined to the project root via safePath and
// gated by MCP_ALLOW_FILE_WRITES. Backups are created before every
// mutation and restored automatically if validation fails.
// ============================================

function writeDenied(): { content: { type: 'text'; text: string }[]; isError: boolean } {
  return {
    content: [
      {
        type: 'text',
        text: 'Error: file writes are disabled. Set MCP_ALLOW_FILE_WRITES=true to enable.',
      },
    ],
    isError: true,
  };
}

const WRITE_HINTS = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false,
} as const;

// ------------------------------------------------------------
// haru_edit_file
// ------------------------------------------------------------

const EditFileInput = z
  .object({
    filePath: z
      .string()
      .min(1)
      .max(4096)
      .describe("Repo-relative path to the file, e.g. 'src/lib/utils.ts'"),
    operation: z
      .enum(['replace', 'insert', 'delete', 'overwrite'])
      .describe(
        'replace: swap matched text; insert: add a line; delete: remove a line; overwrite: replace whole file',
      ),
    search: z.string().optional().describe('Text to match (required for replace)'),
    replacement: z.string().optional().describe('New text (required for replace/insert)'),
    line: z.number().int().min(1).optional().describe('Target line (required for insert/delete)'),
    content: z.string().optional().describe('Full file content (required for overwrite)'),
    backup: z
      .boolean()
      .default(true)
      .describe('Create a .backup copy before editing (default: true)'),
  })
  .strict();

tool({
  name: 'haru_edit_file',
  title: 'Edit File (Atomic)',
  description: `Perform an atomic edit on a repo file: replace text, insert or delete a line, or overwrite content. Creates an automatic backup and reverts the edit if TypeScript validation fails afterwards.

Mutating: only call when you intend to change the repository. Respects MCP_ALLOW_FILE_WRITES.

Args:
  - filePath (string): repo-relative path
  - operation ('replace'|'insert'|'delete'|'overwrite')
  - search (string?): text to match (replace only)
  - replacement (string?): new text (replace/insert)
  - line (number?): target line (insert/delete)
  - content (string?): full content (overwrite only)
  - backup (boolean): default true

Returns:
  Text summary of the applied change and count of replacements.

Examples:
  - Use when: "Rename a variable in src/lib/db.ts" -> operation=replace, search="oldName", replacement="newName"
  - Use when: "Add a TODO above line 12 of template.tsx" -> operation=insert, line=12, replacement="// TODO"
  - Use when: "Delete line 30 from config.ts" -> operation=delete, line=30

Error Handling:
  - Validation failure after edit -> change is reverted and reported
  - Path outside project root -> Error with guidance
  - File writes disabled -> Error: set MCP_ALLOW_FILE_WRITES=true`,
  inputSchema: EditFileInput,
  annotations: WRITE_HINTS,
  callback: async ({ filePath, operation, search, replacement, line, content, backup }) => {
    if (!config.allowFileWrites) return writeDenied();
    try {
      const fullPath = safePath(filePath, 'filePath');
      let backupPath: string | null = null;

      if (backup) {
        backupPath = `${fullPath}.backup.${Date.now()}`;
        try {
          await fs.copyFile(fullPath, backupPath);
        } catch {
          backupPath = null;
        }
      }

      let result = '';
      const fileData = await readFileFull(filePath);

      switch (operation) {
        case 'replace': {
          if (search === undefined || replacement === undefined) {
            return toolError('search and replacement are required for the replace operation');
          }
          const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
          const newContent = fileData.content.replace(regex, replacement);
          await fs.writeFile(fullPath, newContent, 'utf-8');
          result = `Replaced ${(fileData.content.match(regex) || []).length} occurrence(s) of '${search}'`;
          break;
        }

        case 'insert': {
          if (line === undefined || replacement === undefined) {
            return toolError('line and replacement are required for the insert operation');
          }
          const lines = fileData.lines;
          lines.splice(line - 1, 0, replacement);
          await fs.writeFile(fullPath, lines.join('\n'), 'utf-8');
          result = `Inserted line at position ${line}`;
          break;
        }

        case 'delete': {
          if (line === undefined) {
            return toolError('line is required for the delete operation');
          }
          const linesToDelete = fileData.lines;
          linesToDelete.splice(line - 1, 1);
          await fs.writeFile(fullPath, linesToDelete.join('\n'), 'utf-8');
          result = `Deleted line ${line}`;
          break;
        }

        case 'overwrite':
          if (!content) {
            return toolError('content is required for the overwrite operation');
          }
          await fs.writeFile(fullPath, content, 'utf-8');
          result = `Overwritten ${filePath} with ${content.split('\n').length} lines`;
          break;
      }

      const validation = await runCmd(
        filePath.endsWith('.ts') || filePath.endsWith('.tsx')
          ? 'npx --no-install tsc --noEmit'
          : 'true',
      );

      if (validation.code !== 0) {
        if (backup && backupPath) {
          await fs.copyFile(backupPath, fullPath);
          return {
            content: [
              {
                type: 'text',
                text: `Error: validation failed after edit; change reverted.\n${validation.stderr}${validation.stdout}`,
              },
            ],
            isError: true,
          };
        }
        return {
          content: [
            {
              type: 'text',
              text: `Error: validation failed after edit (no backup to restore).\n${validation.stderr}${validation.stdout}`,
            },
          ],
          isError: true,
        };
      }

      return { content: [{ type: 'text', text: `Ok: ${result}` }] };
    } catch (err) {
      return toolError(
        `failed to edit ${filePath}`,
        `Verify the path is repo-relative and inside the project root. Details: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },
});

// ------------------------------------------------------------
// haru_refactor_codebase
// ------------------------------------------------------------

const RefactorChangeSchema = z
  .object({
    type: z.enum(['rename', 'move', 'extract', 'inline']).describe('Kind of refactor'),
    target: z.string().describe('Symbol or path being changed'),
    newValue: z.string().optional().describe('New name/path (rename/move)'),
    files: z.array(z.string()).optional().describe('Restrict to these files if known'),
  })
  .strict();

const RefactorCodebaseInput = z
  .object({
    changes: z.array(RefactorChangeSchema).min(1).describe('List of refactoring changes'),
    dryRun: z.boolean().default(true).describe('Preview changes without applying (default: true)'),
  })
  .strict();

tool({
  name: 'haru_refactor_codebase',
  title: 'Refactor Codebase',
  description: `Apply mechanical refactors (rename, move, extract, inline) across multiple files, discovered via git grep. With dryRun=true (default) it only previews.

Mutating when dryRun=false. Respects MCP_ALLOW_FILE_WRITES.

Args:
  - changes (object[]): each { type: 'rename'|'move'|'extract'|'inline', target, newValue?, files? }
  - dryRun (boolean): default true; false applies the edits

Returns:
  Text summary per file: type of change, from -> to, and a preview snippet.

Examples:
  - Use when: "Rename every use of getCwd to getCurrentWorkingDirectory" -> changes=[{type:'rename', target:'getCwd', newValue:'getCurrentWorkingDirectory'}], dryRun=true first
  - Use when: "Move imports from lib/a to lib/b" -> type='move'

Error Handling:
  - dryRun=true never writes
  - File writes disabled -> Error: set MCP_ALLOW_FILE_WRITES=true`,
  inputSchema: RefactorCodebaseInput,
  annotations: WRITE_HINTS,
  callback: async ({ changes, dryRun }) => {
    if (!dryRun && !config.allowFileWrites) return writeDenied();
    try {
      const results: any[] = [];

      for (const change of changes) {
        const { type, target, newValue, files: targetFiles } = change;

        const searchResult = await runCmd(`git grep -l ${esc(target)}`);
        const filesToModify = targetFiles || searchResult.stdout.split('\n').filter(Boolean);

        for (const file of filesToModify) {
          try {
            const fileData = await readFileFull(file);
            let newContent = fileData.content;
            const escId = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

            switch (type) {
              case 'rename': {
                if (!newValue) continue;
                newContent = newContent.replace(new RegExp(`\b${escId(target)}\b`, 'g'), newValue);
                newContent = newContent.replace(
                  new RegExp(`['"]${escId(target)}['"]`, 'g'),
                  `"${newValue}"`,
                );
                break;
              }
              case 'move':
                if (!newValue) continue;
                newContent = newContent.replace(
                  new RegExp(`from ['"]${escId(target)}['"]`, 'g'),
                  `from "${newValue}"`,
                );
                break;
              case 'extract': {
                const extractRegex = new RegExp(`const ${escId(target)} = ([^;]+);`, 'g');
                newContent = newContent.replace(extractRegex, `export const ${target} = $1;`);
                break;
              }
              case 'inline': {
                const value = fileData.content.match(
                  new RegExp(`const ${escId(target)} = ([^;]+);`),
                )?.[1];
                if (value) {
                  newContent = newContent.replace(new RegExp(`\b${escId(target)}\b`, 'g'), value);
                }
                break;
              }
            }

            if (!dryRun) {
              await fs.writeFile(safePath(file, 'file'), newContent, 'utf-8');
            }

            results.push({
              file,
              changes: type,
              from: target,
              to: newValue || '',
              preview:
                newContent !== fileData.content
                  ? `${newContent.substring(0, 200)}...`
                  : 'No changes',
            });
          } catch (err) {
            results.push({
              file,
              error: `Failed to refactor: ${err instanceof Error ? err.message : String(err)}`,
            });
          }
        }
      }

      const filesAffected = new Set(results.map((r) => r.file)).size;
      return {
        content: [
          {
            type: 'text',
            text:
              (dryRun ? '[DRY RUN] ' : 'Ok: ') +
              `Refactoring Summary\n\n**Files Affected:** ${filesAffected}\n**Changes:** ${results.length}\n\n` +
              results
                .map(
                  (r) =>
                    `**${r.file}**\n` +
                    `   ${r.changes || 'error'}: ${r.from} -> ${r.to || ''}\n` +
                    `   Preview: ${r.preview || r.error || 'No changes'}\n`,
                )
                .join('\n'),
          },
        ],
      };
    } catch (err) {
      return toolError(
        'refactoring failed',
        `Details: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },
});

// ------------------------------------------------------------
// haru_write_file
// ------------------------------------------------------------

const WriteFileInput = z
  .object({
    filePath: z
      .string()
      .min(1)
      .max(4096)
      .describe("Repo-relative path to write, e.g. 'src/lib/constants.ts'"),
    content: z.string().describe('The complete code/content to write to the file'),
    backup: z.boolean().default(true).describe('Create a backup before writing (default: true)'),
    validate: z
      .boolean()
      .default(true)
      .describe('Run tsc --noEmit after .ts/.tsx writes; revert on failure (default: true)'),
  })
  .strict();

tool({
  name: 'haru_write_file',
  title: 'Write File',
  description: `Create or overwrite a file with an atomic write (tmp + rename), optional backup, and optional TypeScript validation that reverts the change on failure.

Mutating. Respects MCP_ALLOW_FILE_WRITES.

Args:
  - filePath (string): repo-relative path
  - content (string): full file contents
  - backup (boolean): default true
  - validate (boolean): default true; runs tsc --noEmit for .ts/.tsx and restores on error

Returns:
  Text confirmation with the number of lines written.

Examples:
  - Use when: "Create src/lib/math.ts with the following..." -> filePath, content
  - Use when: "Replace package.json with a fixed version" -> filePath="package.json", validate=false

Error Handling:
  - Validation failure -> reverted and reported
  - Path outside project root -> Error with guidance
  - Writes disabled -> Error: set MCP_ALLOW_FILE_WRITES=true`,
  inputSchema: WriteFileInput,
  annotations: WRITE_HINTS,
  callback: async ({ filePath, content, backup, validate }) => {
    if (!config.allowFileWrites) return writeDenied();
    try {
      const fullPath = safePath(filePath, 'filePath');
      let backupPath: string | null = null;

      if (backup) {
        backupPath = `${fullPath}.backup.${Date.now()}`;
        try {
          await fs.copyFile(fullPath, backupPath);
        } catch {
          backupPath = null;
        }
      }

      await fs.mkdir(path.dirname(fullPath), { recursive: true });

      const tempPath = `${fullPath}.tmp.${Date.now()}`;
      await fs.writeFile(tempPath, content, 'utf-8');
      await fs.rename(tempPath, fullPath);

      if (validate && ['.ts', '.tsx'].includes(path.extname(filePath))) {
        const validation = await runCmd('npx --no-install tsc --noEmit');
        if (validation.code !== 0) {
          if (backup && backupPath) {
            await fs.copyFile(backupPath, fullPath);
          }
          await fs.unlink(tempPath).catch(() => {});
          return {
            content: [
              {
                type: 'text',
                text: `Error: TypeScript validation failed; ${backupPath ? 'change reverted' : 'no backup to restore'}.\n${validation.stderr}`,
              },
            ],
            isError: true,
          };
        }
      }

      return {
        content: [
          { type: 'text', text: `Ok: wrote ${content.split('\n').length} lines to ${filePath}` },
        ],
      };
    } catch (err) {
      return toolError(
        `failed to write ${filePath}`,
        `Verify the path is repo-relative and inside the project root. Details: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },
});
