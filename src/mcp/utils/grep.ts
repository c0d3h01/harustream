import { esc, runCmd } from './exec.js';

export interface GrepMatch {
  file: string;
  line: number;
  content: string;
}

export interface GrepGroup {
  file: string;
  count: number;
  matches: GrepMatch[];
}

const MAX_PATTERN_LEN = 1024;

/**
 * Validate a user-supplied pattern.
 * - Length 1..1024
 * - No NUL bytes
 * - No control characters
 * - No `..` (we don't want users searching with directory-walk patterns)
 */
export function assertSafePattern(pattern: string, label: string): void {
  if (pattern.length === 0 || pattern.length > MAX_PATTERN_LEN) {
    throw new Error(`${label} must be 1-${MAX_PATTERN_LEN} characters`);
  }
  if (pattern.includes('\u0000')) throw new Error(`${label} contains NUL bytes`);
  for (let i = 0; i < pattern.length; i++) {
    const code = pattern.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) {
      throw new Error(`${label} contains control characters`);
    }
  }
  if (pattern.includes('..')) throw new Error(`${label} must not contain '..': ${pattern}`);
}

/** Parse `git grep -n` output into structured match objects. */
export function parseGrepLines(stdout: string): GrepMatch[] {
  const out: GrepMatch[] = [];
  for (const line of stdout.split('\n')) {
    if (!line) continue;
    const m = line.match(/^([^:]+):(\d+):(.*)$/);
    if (m) out.push({ file: m[1], line: Number.parseInt(m[2], 10), content: m[3] });
  }
  return out;
}

export function groupByFile(matches: GrepMatch[]): GrepGroup[] {
  const byFile: Record<string, GrepMatch[]> = {};
  for (const m of matches) {
    const list = byFile[m.file] ?? [];
    list.push(m);
    byFile[m.file] = list;
  }
  return Object.entries(byFile).map(([file, ms]) => ({ file, count: ms.length, matches: ms }));
}

/**
 * Run a git grep with a constructed argv. The query is shell-escaped safely.
 * - `mode`: 'regex' (-E), 'plain' (no flag), 'fulltext' (case-insensitive -i)
 * - `subpath`: limit search to a folder
 * - `contextLines`: 0..20, added to the command when > 0
 * - `caseSensitive`: if false, adds -i
 * - `includeUntracked`: passes --untracked (default true)
 */
export interface GitGrepOpts {
  query: string;
  mode?: 'regex' | 'plain' | 'fulltext' | 'symbol';
  subpath?: string;
  contextLines?: number;
  caseSensitive?: boolean;
  includeUntracked?: boolean;
  /** When true, -l is used (list filenames only). */
  filesOnly?: boolean;
}

export async function runGitGrep(
  opts: GitGrepOpts,
): Promise<{ stdout: string; stderr: string; code: number }> {
  const flags: string[] = ['-n', '-I'];
  if (opts.mode === 'regex' || opts.mode === 'symbol') flags.push('-E');
  if (!opts.caseSensitive) flags.push('-i');
  if (opts.includeUntracked !== false) flags.push('--untracked');
  if (opts.filesOnly) flags.push('-l');
  const ctx = Math.min(Math.max(0, opts.contextLines ?? 0), 20);
  if (ctx > 0 && !opts.filesOnly) {
    flags.push(`-A ${ctx}`, `-B ${ctx}`);
  }

  // Symbol mode: search for the literal identifier as a whole word.
  // The previous implementation built a regex like
  //   `(export|const|function|class|interface|type|let)[[:space:]]+<query>`
  // which fails for any query containing regex meta-characters (e.g. a function
  // named `getX$`). The new approach is to wrap the query in \b...\b.
  const q = opts.mode === 'symbol' ? `\\b(${esc(opts.query).slice(1, -1)})\\b` : esc(opts.query);

  const subpath = opts.subpath ? ` -- ${esc(opts.subpath)}` : '';
  return runCmd(`git grep ${flags.join(' ')} ${q}${subpath}`);
}
