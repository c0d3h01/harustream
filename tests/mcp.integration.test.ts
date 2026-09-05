/**
 * Integration tests for haru-mcp. Spawns the server over stdio and exercises
 * every tool end-to-end.
 *
 * These are opt-in to keep `pnpm test` (and the CI fast lane) cheap:
 *
 *   RUN_MCP_INTEGRATION=1 pnpm test:integration
 *
 * Or directly:
 *
 *   RUN_MCP_INTEGRATION=1 npx vitest run tests/mcp.integration.test.ts
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ENABLED = process.env.RUN_MCP_INTEGRATION === '1';

const callTool = async (client: Client, name: string, args: Record<string, unknown> = {}) => {
  const result = await client.callTool({ name, arguments: args });
  return result as unknown as {
    content: Array<{ type: string; text: string }>;
    structuredContent?: Record<string, unknown>;
    isError?: boolean;
  };
};

const itIfEnabled = ENABLED ? it : it.skip;

describe.skipIf(!ENABLED)('haru-mcp integration', () => {
  let client: Client;

  beforeAll(async () => {
    const transport = new StdioClientTransport({
      command: 'pnpm',
      args: ['exec', 'tsx', 'src/mcp/index.ts'],
      env: {
        ...(process.env as Record<string, string>),
        MCP_ALLOW_FILE_WRITES: 'true',
        MCP_ALLOW_ARBITRARY_COMMANDS: 'true',
        MCP_LOG_LEVEL: 'error',
      },
      stderr: 'pipe',
    });
    client = new Client({ name: 'integration-test', version: '1.0.0' });
    await client.connect(transport);
  }, 30_000);

  afterAll(async () => {
    try {
      await client?.close();
    } catch {}
    // Cleanup any temp files that may have been created.
    for (const f of ['src/mcp/__test_tmp_mcp.ts', 'dev_runtime.log']) {
      try {
        await fs.unlink(path.join(process.cwd(), f));
      } catch {}
    }
    try {
      const dir = path.join(process.cwd(), 'src/mcp');
      for (const f of await fs.readdir(dir)) {
        if (f.includes('.backup.') || f.includes('.tmp.')) {
          try {
            await fs.unlink(path.join(dir, f));
          } catch {}
        }
      }
    } catch {}
  });

  itIfEnabled('health_check reports identity and limits', async () => {
    const res = await callTool(client, 'haru_health_check', {});
    expect(res.isError).toBeFalsy();
    const sc = res.structuredContent as Record<string, unknown>;
    const limits = sc.limits as Record<string, unknown>;
    expect(sc.server_name).toBe('haru-mcp-server');
    expect(sc.server_version).toBe('5.0.0');
    expect(sc.tools_registered).toBe(20);
    expect(limits.command_timeout_ms).toBe(30_000);
    expect(limits.max_response_mb).toBe(4);
    expect(limits.read_concurrency).toBe(4);
    expect(limits.allow_file_writes).toBe(true);
  });

  itIfEnabled('read_file reads a line window', async () => {
    const res = await callTool(client, 'haru_read_file', {
      filePath: 'src/mcp/server.ts',
      startLine: 1,
      endLine: 3,
    });
    expect(res.isError).toBeFalsy();
    const sc = res.structuredContent as Record<string, unknown>;
    expect(sc.filePath).toBe('src/mcp/server.ts');
    expect(sc.startLine).toBe(1);
    expect(sc.endLine).toBe(3);
  });

  itIfEnabled('read_file rejects traversal', async () => {
    const res = await callTool(client, 'haru_read_file', { filePath: '../outside.txt' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/must stay inside project root/i);
  });

  itIfEnabled('get_file_signatures returns symbol names (not full lines)', async () => {
    const res = await callTool(client, 'haru_get_file_signatures', {
      filePath: 'src/mcp/server.ts',
    });
    expect(res.isError).toBeFalsy();
    const sc = res.structuredContent as Record<string, unknown>;
    const symbols = sc.symbols as string[];
    expect(symbols.length).toBeGreaterThan(3);
    // Sanity: returned values are bare identifiers, not `export const X` lines.
    for (const s of symbols) expect(s).not.toContain('export const');
  });

  itIfEnabled('search_codebase accepts queries with parentheses', async () => {
    // The old assertSafePattern rejected any pattern with `(`; the new one doesn't.
    const res = await callTool(client, 'haru_search_codebase', { query: 'fetch(', limit: 5 });
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).not.toMatch(/unsafe characters/i);
  });

  itIfEnabled('search_codebase returns matches and pagination metadata', async () => {
    const res = await callTool(client, 'haru_search_codebase', {
      query: 'haru',
      limit: 5,
      responseFormat: 'json',
    });
    const sc = res.structuredContent as Record<string, unknown>;
    expect(sc.total as number).toBeGreaterThan(0);
    expect((sc.matches as unknown[]).length).toBeGreaterThan(0);
  });

  itIfEnabled('smart_search groups by file and paginates', async () => {
    const res = await callTool(client, 'haru_smart_search', {
      query: 'haru',
      searchType: 'regex',
      limit: 2,
      offset: 0,
      responseFormat: 'json',
    });
    const sc = res.structuredContent as Record<string, unknown>;
    expect((sc.groups as unknown[]).length).toBeLessThanOrEqual(2);
  });

  itIfEnabled('read_codebase is directory-scoped and skips oversized files', async () => {
    const res = await callTool(client, 'haru_read_codebase', {
      includePatterns: ['src/mcp/*.ts'],
      excludePatterns: ['node_modules/**'],
      maxFileSize: 1_048_576,
    });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.metadata.totalFiles).toBeGreaterThan(0);
    const keys = Object.keys(parsed.files);
    expect(keys.length).toBeLessThan(50);
    for (const k of keys) {
      expect(k.replace(/^\.\//, '').startsWith('src/mcp/')).toBe(true);
    }
  });

  itIfEnabled('review_changes returns without error on clean tree', async () => {
    const res = await callTool(client, 'haru_review_changes', { format: 'json' });
    expect(res.isError).toBeFalsy();
    const text = res.content[0].text;
    const isJson = (() => {
      try {
        JSON.parse(text);
        return true;
      } catch {
        return false;
      }
    })();
    const noChanges = text.includes('No pending changes');
    expect(isJson || noChanges).toBe(true);
  });

  itIfEnabled(
    'check_quality typescript gate passes',
    async () => {
      const res = await callTool(client, 'haru_check_quality', { include: ['typescript'] });
      expect(res.isError).toBeFalsy();
      const sc = res.structuredContent as Record<string, unknown>;
      expect(sc.passed).toBe(true);
    },
    60_000,
  );

  itIfEnabled(
    'format_lint runs without writing when write=false',
    async () => {
      const res = await callTool(client, 'haru_format_lint', {
        path: 'src/mcp',
        write: false,
        check: true,
      });
      expect(res.isError).toBeFalsy();
    },
    60_000,
  );

  itIfEnabled('profile_performance report returns memory', async () => {
    const res = await callTool(client, 'haru_profile_performance', { action: 'report' });
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toMatch(/Performance Report/);
  });

  itIfEnabled('profile_performance analyze runs a command', async () => {
    const res = await callTool(client, 'haru_profile_performance', {
      action: 'analyze',
      command: 'echo hello',
      iterations: 1,
    });
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toMatch(/Performance Analysis/);
  });

  itIfEnabled('get_logs errors on missing file', async () => {
    const res = await callTool(client, 'haru_get_logs', { logFile: 'nonexistent.log' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/log file not found/i);
  });

  itIfEnabled('tail_logs highlights and filters correctly', async () => {
    const logPath = path.join(process.cwd(), 'dev_runtime.log');
    await fs.writeFile(logPath, 'error 1\nerror 2\ninfo 3\nerror 4\n', 'utf-8');
    const res = await callTool(client, 'haru_tail_logs', {
      logFile: 'dev_runtime.log',
      lines: 10,
      filter: 'error',
    });
    expect(res.isError).toBeFalsy();
    const text = res.content[0].text;
    expect(text).toContain('**error**');
    expect(text).not.toContain('****error****');
    const lines = text
      .split('\n')
      .map((l) => l.replace(/\*\*/g, ''))
      .filter(Boolean);
    expect(lines.length).toBe(3);
  });

  itIfEnabled('plan_build returns phases without error', async () => {
    const res = await callTool(client, 'haru_plan_build', {
      taskDescription: 'Add caching layer',
      scope: ['src/providers'],
    });
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toMatch(/BUILD PLAN/);
    expect(res.content[0].text).toMatch(/Complexity:/);
  });

  itIfEnabled('plan_task returns structured steps', async () => {
    const res = await callTool(client, 'haru_plan_task', { task: 'Refactor providers' });
    expect(res.isError).toBeFalsy();
    const sc = res.structuredContent as Record<string, unknown>;
    expect((sc.steps as unknown[]).length).toBe(sc.step_count);
  });

  itIfEnabled('write_file creates and overwrites a file atomically', async () => {
    const tmp = 'src/mcp/__test_tmp_mcp.ts';
    const content = 'export const tmpTest = 42;\n';
    const res = await callTool(client, 'haru_write_file', {
      filePath: tmp,
      content,
      backup: false,
      validate: false,
    });
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toMatch(/wrote 2 lines/);
    await fs.unlink(path.join(process.cwd(), tmp)).catch(() => {});
  });

  itIfEnabled('edit_file replace operation works', async () => {
    const tmp = 'src/mcp/__test_tmp_mcp.ts';
    await fs.writeFile(path.join(process.cwd(), tmp), 'export const tmpVal = 1;\n', 'utf-8');
    const res = await callTool(client, 'haru_edit_file', {
      filePath: tmp,
      operation: 'replace',
      search: '1',
      replacement: '99',
      backup: false,
    });
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toMatch(/Replaced 1 occurrence/);
    const after = await fs.readFile(path.join(process.cwd(), tmp), 'utf-8');
    expect(after).toContain('99');
    await fs.unlink(path.join(process.cwd(), tmp)).catch(() => {});
  });

  itIfEnabled('refactor_codebase dryRun previews changes', async () => {
    const res = await callTool(client, 'haru_refactor_codebase', {
      changes: [{ type: 'rename', target: 'haru', newValue: 'haru2' }],
      dryRun: true,
    });
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toContain('[DRY RUN]');
    expect(res.content[0].text).toMatch(/Files Affected:/);
  });

  itIfEnabled(
    'agent_self_review runs the lightweight checklist',
    async () => {
      const res = await callTool(client, 'haru_agent_self_review', { skipTests: true });
      expect(res.structuredContent).toBeDefined();
      const sc = res.structuredContent as Record<string, unknown>;
      expect((sc.checks as unknown[]).length).toBeGreaterThan(0);
    },
    60_000,
  );
});
