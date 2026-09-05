/**
 * Fast unit tests for haru-mcp helpers and tool registration.
 *
 * This file is picked up by `pnpm test` (vitest.config.ts).
 * It does NOT spawn the MCP server. The stdio integration tests live in
 * `tests/mcp.integration.test.ts` and run only when `RUN_MCP_INTEGRATION=1`.
 */
import { describe, expect, it } from 'vitest';
import { safePath } from '../src/mcp/config';
import { getRegisteredToolCount, getRegisteredToolNames } from '../src/mcp/server';
import { esc } from '../src/mcp/utils/exec';
import { truncateOutput } from '../src/mcp/utils/format';
import { globToRegex } from '../src/mcp/utils/glob';
import { assertSafePattern, groupByFile, parseGrepLines } from '../src/mcp/utils/grep';
import { paginate } from '../src/mcp/utils/pagination';

// Tool registration has side effects: importing the tool modules populates
// the McpServer instance. We import them once here to verify the count.
import '../src/mcp/tools/agent';
import '../src/mcp/tools/codebase';
import '../src/mcp/tools/dependencies';
import '../src/mcp/tools/files';
import '../src/mcp/tools/git';
import '../src/mcp/tools/health';
import '../src/mcp/tools/ops';
import '../src/mcp/tools/planning';
import '../src/mcp/tools/quality';

describe('esc()', () => {
  it('quotes simple strings', () => {
    expect(esc('hello')).toBe("'hello'");
  });
  it('escapes single quotes', () => {
    expect(esc("a'b")).toBe("'a'\\''b'");
  });
  it('rejects NUL bytes', () => {
    expect(() => esc('a\u0000b')).toThrow();
  });
  it('rejects oversized arguments', () => {
    expect(() => esc('a'.repeat(5000))).toThrow();
  });
});

describe('safePath()', () => {
  it('blocks traversal', () => {
    expect(() => safePath('../outside.txt')).toThrow(/must stay inside project root/);
  });
  it('blocks absolute paths', () => {
    expect(() => safePath('/etc/passwd')).toThrow();
  });
  it('accepts repo-relative paths', () => {
    const p = safePath('src/mcp/server.ts');
    expect(p.endsWith('src/mcp/server.ts')).toBe(true);
  });
});

describe('paginate()', () => {
  it('slices a window', () => {
    const items = Array.from({ length: 10 }, (_, i) => i);
    const page = paginate(items, 3, 4);
    expect(page.items).toEqual([4, 5, 6]);
    expect(page.total).toBe(10);
    expect(page.has_more).toBe(true);
    expect(page.next_offset).toBe(7);
  });
  it('reports end-of-stream', () => {
    const items = Array.from({ length: 10 }, (_, i) => i);
    const last = paginate(items, 3, 9);
    expect(last.items).toEqual([9]);
    expect(last.has_more).toBe(false);
    expect(last.next_offset).toBeUndefined();
  });
});

describe('truncateOutput()', () => {
  it('returns short strings unchanged', () => {
    expect(truncateOutput('hello', 1000)).toBe('hello');
  });
  it('truncates long strings with a notice', () => {
    const long = 'a'.repeat(5000);
    const out = truncateOutput(long, 1000);
    expect(Buffer.byteLength(out, 'utf8')).toBeLessThanOrEqual(1500);
    expect(out).toContain('truncated');
  });
});

describe('parseGrepLines() + groupByFile()', () => {
  it('parses `git grep -n` lines', () => {
    const stdout = 'src/a.ts:10:hello\nsrc/a.ts:20:world\nsrc/b.ts:3:hi\n';
    const matches = parseGrepLines(stdout);
    expect(matches).toEqual([
      { file: 'src/a.ts', line: 10, content: 'hello' },
      { file: 'src/a.ts', line: 20, content: 'world' },
      { file: 'src/b.ts', line: 3, content: 'hi' },
    ]);
  });
  it('groups by file with counts', () => {
    const stdout = 'a.ts:1:x\na.ts:2:y\nb.ts:1:z\n';
    const groups = groupByFile(parseGrepLines(stdout));
    expect(groups).toHaveLength(2);
    const a = groups.find((g) => g.file === 'a.ts');
    expect(a?.count).toBe(2);
  });
});

describe('assertSafePattern()', () => {
  it('accepts normal patterns (including parens)', () => {
    // The old implementation rejected any pattern containing `(` or `)`.
    // The new one only checks length, NUL bytes, control chars, and `..`.
    expect(() => assertSafePattern('fetch(', 'query')).not.toThrow();
    expect(() => assertSafePattern('a.b$c+d', 'query')).not.toThrow();
  });
  it('rejects NUL bytes and control chars', () => {
    expect(() => assertSafePattern('a\u0000b', 'query')).toThrow();
  });
  it('rejects `..`', () => {
    expect(() => assertSafePattern('../../etc/passwd', 'query')).toThrow();
  });
});

describe('globToRegex()', () => {
  it('translates a simple pattern', () => {
    const re = globToRegex('src/mcp/*.ts');
    expect(re.test('src/mcp/index.ts')).toBe(true);
    expect(re.test('src/mcp/sub/x.ts')).toBe(false);
  });
  it('handles **', () => {
    const re = globToRegex('src/**/*.ts');
    expect(re.test('src/a/b/c.ts')).toBe(true);
  });
  it('handles {a,b}', () => {
    const re = globToRegex('src/{a,b}.ts');
    expect(re.test('src/a.ts')).toBe(true);
    expect(re.test('src/b.ts')).toBe(true);
    expect(re.test('src/c.ts')).toBe(false);
  });
});

describe('tool registration', () => {
  it('registers exactly 20 tools', () => {
    expect(getRegisteredToolCount()).toBe(20);
  });

  it('all tool names follow the haru_ snake_case scheme', () => {
    const names = getRegisteredToolNames();
    for (const n of names) {
      expect(n).toMatch(/^haru_[a-z0-9_]+$/);
    }
    // Sanity: the well-known tools are all present.
    expect(names).toEqual(
      expect.arrayContaining([
        'haru_health_check',
        'haru_read_file',
        'haru_search_codebase',
        'haru_smart_search',
        'haru_edit_file',
        'haru_write_file',
        'haru_refactor_codebase',
        'haru_review_changes',
        'haru_check_quality',
        'haru_run_tests',
        'haru_format_lint',
        'haru_get_logs',
        'haru_tail_logs',
        'haru_profile_performance',
        'haru_plan_build',
        'haru_plan_task',
        'haru_analyze_dependencies',
        'haru_agent_self_review',
        'haru_read_codebase',
        'haru_get_file_signatures',
      ]),
    );
  });
});
