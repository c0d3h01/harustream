import { exec } from 'node:child_process';
import type { Stats } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import { pino } from 'pino';
import type { z } from 'zod';

// ============================================================
// RUNTIME CONFIGURATION
// Every knob is env-driven so a single deployment config can
// tune the server without code changes. Defaults are chosen for
// production safety: bounded timeouts, bounded buffers/outputs,
// no network installs, and filesystem writes confined to the
// project root unless explicitly allowed.
// ============================================================

function parseMb(value: string | undefined, fallbackMb: number): number {
  if (!value) return Math.round(fallbackMb * 1024 * 1024);
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n) || n <= 0) return Math.round(fallbackMb * 1024 * 1024);
  return Math.round(n * 1024 * 1024);
}

function clampInt(value: string | undefined, min: number, max: number, fallback: number): number {
  if (!value) return fallback;
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const;
const configuredLevel = String(process.env.MCP_LOG_LEVEL ?? 'info').toLowerCase();

export const config = {
  /** Per shell command timeout (ms). */
  commandTimeoutMs: clampInt(process.env.MCP_COMMAND_TIMEOUT_MS, 1_000, 300_000, 30_000),
  /** Max captured stdout/stderr per command (bytes). */
  maxBufferBytes: parseMb(process.env.MCP_MAX_BUFFER_MB, 100),
  /** Max text returned in a single tool response (bytes). */
  maxResponseBytes: parseMb(process.env.MCP_MAX_RESPONSE_MB, 4),
  /** Parallel file reads in codebase scans. */
  readConcurrency: clampInt(process.env.MCP_READ_CONCURRENCY, 1, 100, 10),
  /** Parallel network calls (npm registry). */
  networkConcurrency: clampInt(process.env.MCP_NETWORK_CONCURRENCY, 1, 50, 5),
  /** Upper bound for tail-style log reads. */
  maxTailLines: clampInt(process.env.MCP_MAX_TAIL_LINES, 100, 50_000, 5_000),
  /** Upper bound on files emitted by the full codebase reader. */
  maxCodebaseFiles: clampInt(process.env.MCP_MAX_CODEBASE_FILES, 10, 50_000, 2_000),
  /** Writes to the repository (git apply not required). */
  allowFileWrites: process.env.MCP_ALLOW_FILE_WRITES !== 'false',
  /** Arbitrary shell commands via profile_performance. */
  allowArbitraryCommands: process.env.MCP_ALLOW_ARBITRARY_COMMANDS !== 'false',
  logLevel: (LOG_LEVELS as readonly string[]).includes(configuredLevel)
    ? (configuredLevel as (typeof LOG_LEVELS)[number])
    : 'info',
} as const;

export const MAX_BUFFER_SIZE = config.maxBufferBytes;

export const projectRoot = process.cwd();
export const execAsync = promisify(exec);

// Server identity follows the MCP convention: {service}-mcp-server.
export const SERVER_NAME = 'haru-mcp-server';
export const SERVER_VERSION = '4.1.0';

export const server = new McpServer({
  name: SERVER_NAME,
  version: SERVER_VERSION,
  description:
    'AI Agent-Optimized MCP Server for Codebase Analysis, Editing, Quality Gates, and Root-Cause Fixes',
});

// ============================================================
// LOGGING
// The stdio transport owns stdout, so ALL logs go to stderr.
// JSON lines (pino) so they can ship straight to any aggregator.
// Per-call success is debug-level; failures are warn/error.
// ============================================================

export const logger = pino({ level: config.logLevel, base: undefined }, process.stderr);

// ============================================================
// SHELL SAFETY
// `esc` single-quote-escapes a value so it can never break out of
// the enclosing command string. Defense in depth with runCmd.
// ============================================================

export function esc(value: unknown): string {
  const str = String(value);
  if (str.length > 4096) throw new Error('Shell argument exceeds 4096 characters');
  for (let i = 0; i < str.length; i += 1) {
    const code = str.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) {
      throw new Error('Shell argument contains control characters');
    }
  }
  return `'` + str.replace(/'/g, `'\\''`) + `'`;
}

// ============================================================
// EXECUTION BOUNDARY
// `runCmd` never rejects: every failure is normalized to a
// { stdout, stderr, code } envelope so handlers can render a
// friendly error while the guarded wrapper logs diagnostics.
// ============================================================

export async function runCmd(
  command: string,
  options: {
    cwd?: string;
    maxBuffer?: number;
    timeout?: number;
  } = {},
): Promise<{ stdout: string; stderr: string; code: number }> {
  if (typeof command !== 'string' || command.trim() === '') {
    return { stdout: '', stderr: 'runCmd: empty command', code: 1 };
  }
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: options.cwd || projectRoot,
      maxBuffer: options.maxBuffer || config.maxBufferBytes,
      timeout: options.timeout || config.commandTimeoutMs,
      env: { ...process.env, FORCE_COLOR: '0', NODE_ENV: 'development' },
    });
    return { stdout: stdout ?? '', stderr: stderr ?? '', code: 0 };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; message?: string; code?: number };
    return {
      stdout: failure.stdout || '',
      stderr: failure.stderr || failure.message || `Command failed: ${command}`,
      code: failure.code || 1,
    };
  }
}

// ============================================================
// PATH SAFETY
// All file operations stay inside projectRoot. Absolute paths
// pointing elsewhere and any `..` traversal are rejected.
// ============================================================

export function safePath(filePath: string, label = 'filePath'): string {
  if (typeof filePath !== 'string' || filePath.trim() === '') {
    throw new Error(`${label} must be a non-empty path`);
  }
  if (filePath.length > 4096) throw new Error(`${label} exceeds 4096 characters`);
  if (filePath.includes('\u0000')) throw new Error(`${label} contains NUL bytes`);
  const resolved = path.resolve(projectRoot, filePath);
  const rel = path.relative(projectRoot, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`${label} must stay inside project root: ${filePath}`);
  }
  return resolved;
}

export function safeRepoRelative(filePath: string, label = 'path'): string {
  const resolved = safePath(filePath, label);
  return path.relative(projectRoot, resolved);
}

// ============================================================
// RESPONSE LIMITS
// Keeps every tool response inside MCP message bounds. Splitting a
// UTF-16 surrogate pair would corrupt encoded text, so the cut
// point is snapped back to a clean boundary.
// ============================================================

function snapToCharBoundary(text: string, index: number): number {
  let i = index;
  while (i > 0) {
    const code = text.charCodeAt(i);
    if (code >= 0xdc00 && code <= 0xdfff) i -= 1;
    else break;
  }
  return i;
}

export function truncateOutput(text: string, maxBytes: number = config.maxResponseBytes): string {
  const totalBytes = Buffer.byteLength(text, 'utf8');
  if (totalBytes <= maxBytes) return text;

  const reserve = 160;
  const budget = maxBytes > reserve ? maxBytes - reserve : 1;

  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (Buffer.byteLength(text.slice(0, mid), 'utf8') <= budget) low = mid;
    else high = mid - 1;
  }

  const cut = snapToCharBoundary(text, low);
  return (
    `${text.slice(0, cut)}\n\n` +
    `...[truncated: ${totalBytes} bytes -> ${Buffer.byteLength(text.slice(0, cut), 'utf8')} bytes; ` +
    `raise MCP_MAX_RESPONSE_MB to see more]`
  );
}

export type TextBlock = { type: 'text'; text: string };
export type ToolResult = {
  content: Array<TextBlock | Record<string, unknown>>;
  isError?: boolean;
  /** Structured payload validated against the tool's outputSchema when set. */
  structuredContent?: Record<string, unknown>;
};

function applyLimits(result: ToolResult): ToolResult {
  if (!result.content) return result;
  return {
    ...result,
    content: result.content.map((block) =>
      block.type === 'text' && typeof block.text === 'string'
        ? { ...block, text: truncateOutput(block.text) }
        : block,
    ),
  };
}

/** Builds a consistent, actionable error result for a tool handler. */
export function toolError(message: string, hint?: string): ToolResult {
  const guidance = hint ? ` ${hint}` : '';
  return {
    content: [{ type: 'text', text: `Error: ${message}.${guidance}` }],
    isError: true,
  };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ============================================================
// RESPONSE FORMATS
// Per the MCP best-practice: data tools support markdown
// (human-readable, default) and json (machine-readable).
// ============================================================

export const RESPONSE_FORMATS = ['markdown', 'json'] as const;
export type ResponseFormat = (typeof RESPONSE_FORMATS)[number];

export function isResponseFormat(value: unknown): value is ResponseFormat {
  return value === 'markdown' || value === 'json';
}

// ============================================================
// PAGINATION
// Shared rules for list-style tools: respect `limit`, always
// report total/count/offset/has_more/next_offset so clients can
// reliably page without ever loading everything into memory.
// ============================================================

export function paginate<T>(
  items: readonly T[],
  limit: number,
  offset: number,
): {
  items: T[];
  total: number;
  count: number;
  offset: number;
  has_more: boolean;
  next_offset: number | undefined;
} {
  const safeLimit = Math.min(Math.max(1, Math.trunc(limit)), 500);
  const safeOffset = Math.max(0, Math.trunc(offset));
  const page = items.slice(safeOffset, safeOffset + safeLimit);
  const next = safeOffset + page.length;
  return {
    items: page,
    total: items.length,
    count: page.length,
    offset: safeOffset,
    has_more: next < items.length,
    next_offset: next < items.length ? next : undefined,
  };
}

// ============================================================
// TOOL BOUNDARY
// Every tool registers through `server.registerTool` (the modern
// SDK API) wrapped in a shared boundary that provides: structured
// timing logs, a global error fallback, response truncation, and
// explicit annotations. Handlers must supply annotations so tool
// semantics (read-only vs destructive) are always announced.
// ============================================================

type LooseRegisterTool = (
  name: string,
  config: {
    title?: string;
    description?: string;
    inputSchema?: z.ZodTypeAny;
    outputSchema?: z.ZodTypeAny;
    annotations?: ToolAnnotations;
  },
  callback: (args: Record<string, unknown>) => Promise<ToolResult>,
) => unknown;

const registerTool = server.registerTool.bind(server) as unknown as LooseRegisterTool;

let registeredToolCount = 0;
export function getRegisteredToolCount(): number {
  return registeredToolCount;
}

export function guarded(
  toolName: string,
  handler: (...args: any[]) => Promise<any>,
): (...args: any[]) => Promise<any> {
  const startedAt = Date.now();
  return async (...args: any[]) => {
    try {
      const result = (await handler(...args)) as ToolResult;
      logger.debug({
        event: 'tool',
        tool: toolName,
        ms: Date.now() - startedAt,
        ok: !result?.isError,
      });
      return applyLimits(result);
    } catch (error) {
      const message = errorMessage(error);
      logger.warn({
        event: 'tool_error',
        tool: toolName,
        ms: Date.now() - startedAt,
        err: message,
      });
      return toolError(`Unexpected failure in ${toolName}`, `Details: ${message}`);
    }
  };
}

export interface ToolRegistration<S extends z.ZodTypeAny> {
  /** snake_case tool name, prefixed with the service (haru_*). */
  name: string;
  /** Human-readable display title. */
  title: string;
  /** Full description: summary, Args, Returns, Examples, Error Handling. */
  description: string;
  /** Strict Zod input schema; parsed at the call boundary. */
  inputSchema: S;
  /** Documented behavior hints for clients. */
  annotations: ToolAnnotations;
  /** Optional output schema; when set the handler MUST return matching structuredContent. */
  outputSchema?: z.ZodTypeAny;
  /** Handler; args are the parsed, validated inputs. */
  callback: (args: z.infer<S>) => Promise<ToolResult>;
}

export function tool<S extends z.ZodTypeAny>(def: ToolRegistration<S>): void {
  registeredToolCount += 1;
  registerTool(
    def.name,
    {
      title: def.title,
      description: def.description,
      inputSchema: def.inputSchema,
      ...(def.outputSchema ? { outputSchema: def.outputSchema } : {}),
      annotations: def.annotations,
    },
    guarded(def.name, (args) => def.callback(args)),
  );
}

// ============================================================
// PARALLELISM WITH A CEILING
// Used wherever an operation fans out over files or network
// requests so a single tool call can never saturate the host.
// ============================================================

export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workerCount = Math.min(Math.max(1, limit), items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

// ============================================================
// FILE HELPERS
// ============================================================

/**
 * Reads entire file with line numbers and metadata, confined to the
 * project root via safePath.
 */
export async function readFileFull(filePath: string): Promise<{
  content: string;
  lines: string[];
  stats: Stats;
}> {
  const fullPath = safePath(filePath, 'filePath');
  const [content, stats] = await Promise.all([fs.readFile(fullPath, 'utf-8'), fs.stat(fullPath)]);
  return { content, lines: content.split('\n'), stats };
}

/**
 * Builds a complete dependency graph of the codebase.
 * Parentheses are shell-escaped (`\(` `\)`) so find groups correctly.
 */
export async function buildDependencyGraph(): Promise<{
  files: Record<
    string,
    {
      imports: string[];
      exportedSymbols: string[];
      dependencies: string[];
    }
  >;
  rootFiles: string[];
}> {
  const graph: Record<string, any> = {};
  const filesResult = await runCmd(
    `find . -type f \\( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.go' \\) ! -path './node_modules/*' ! -path './.next/*'`,
  );

  const files = filesResult.stdout.split('\n').filter(Boolean);

  for (const file of files) {
    try {
      const { content } = await readFileFull(file);
      const imports = Array.from(content.matchAll(/^(?:import|require)\s*[^;]+/gm) || []).map((m) =>
        m[0].trim(),
      );
      const exports = Array.from(
        content.matchAll(/^[\s]*(?:export|const|function|class|interface|type)\s+[^\s;]+/gm) || [],
      ).map((m) => m[0].trim());

      graph[file] = { imports, exportedSymbols: exports, dependencies: [] };
    } catch (_err) {
      graph[file] = { imports: [], exportedSymbols: [], dependencies: [] };
    }
  }

  // Resolve dependencies
  for (const [file, data] of Object.entries(graph)) {
    for (const imp of data.imports) {
      const match = imp.match(/['"]([^'"]+)['"]/);
      if (match) {
        const target = match[1];
        if (target.startsWith('.') || target.startsWith('/')) {
          const resolved = path.resolve(
            path.dirname(file),
            target +
              (target.endsWith('.ts') ||
              target.endsWith('.tsx') ||
              target.endsWith('.js') ||
              target.endsWith('.go')
                ? ''
                : '.ts'),
          );
          if (graph[resolved]) data.dependencies.push(resolved);
        }
      }
    }
  }

  return { files: graph, rootFiles: Object.keys(graph) };
}
