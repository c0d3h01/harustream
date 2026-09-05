import { runCmd } from './exec.js';

let fgCache: typeof import('fast-glob') | null | undefined;

async function getFastGlob(): Promise<typeof import('fast-glob') | null> {
  if (fgCache !== undefined) return fgCache;
  try {
    const mod = await import('fast-glob');
    fgCache = mod as unknown as typeof import('fast-glob');
    return fgCache;
  } catch {
    fgCache = null;
    return null;
  }
}

const REGEX_META = /[.+^${}()|[\]\\]/g;

/** Minimal glob -> regex (supports `**`, `*`, `?`, `{a,b}`). */
export function globToRegex(pattern: string): RegExp {
  let regex = '^';
  for (let i = 0; i < pattern.length; ) {
    const c = pattern[i];
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        if (pattern[i + 2] === '/') {
          regex += '(?:.*\\/)?';
          i += 3;
        } else {
          regex += '.*';
          i += 2;
        }
      } else {
        regex += '[^/]*';
        i += 1;
      }
    } else if (c === '?') {
      regex += '[^/]';
      i += 1;
    } else if (c === '{') {
      const close = pattern.indexOf('}', i);
      if (close !== -1) {
        const inner = pattern.slice(i + 1, close);
        const opts = inner
          .split(',')
          .map((s) => s.replace(REGEX_META, '\\$&'))
          .join('|');
        regex += `(?:${opts})`;
        i = close + 1;
      } else {
        regex += '\\{';
        i += 1;
      }
    } else {
      regex += c.replace(REGEX_META, '\\$&');
      i += 1;
    }
  }
  regex += '$';
  return new RegExp(regex);
}

function matchesAny(filePath: string, patterns: string[]): boolean {
  for (const p of patterns) {
    if (globToRegex(p).test(filePath)) return true;
  }
  return false;
}

/** Return all files in the repository matching include globs minus exclude globs. */
export async function globFiles(
  includePatterns: string[],
  excludePatterns: string[],
): Promise<string[]> {
  const fg = await getFastGlob();
  if (fg) {
    const patterns = includePatterns.length ? includePatterns : ['**/*'];
    try {
      const entries = await (
        fg as unknown as { glob: (p: string[], o: unknown) => Promise<string[]> }
      ).glob(patterns, {
        ignore: excludePatterns,
        dot: false,
        onlyFiles: true,
        followSymbolicLinks: false,
      });
      if (entries.length) return entries.map((f) => f.replace(/^\.\//, ''));
    } catch {
      // fall through to git
    }
  }

  // Fallback: list tracked + untracked files via git (cheap).
  const r = await runCmd('git ls-files --cached --others --exclude-standard');
  const all = r.stdout
    .split('\n')
    .filter(Boolean)
    .map((f) => f.replace(/^\.\//, ''));
  return all.filter((f) => {
    const inc = includePatterns.length ? matchesAny(f, includePatterns) : true;
    const exc = matchesAny(f, excludePatterns);
    return inc && !exc;
  });
}
