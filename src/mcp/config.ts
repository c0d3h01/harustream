import * as path from 'node:path';

// ----- env parsing helpers -----

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

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  const v = value.trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes' || v === 'on') return true;
  if (v === 'false' || v === '0' || v === 'no' || v === 'off') return false;
  return fallback;
}

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const;
type LogLevel = (typeof LOG_LEVELS)[number];
const configuredLevel = String(process.env.MCP_LOG_LEVEL ?? 'info').toLowerCase();
const logLevel: LogLevel = (LOG_LEVELS as readonly string[]).includes(configuredLevel)
  ? (configuredLevel as LogLevel)
  : 'info';

// ----- config object -----

export interface McpConfig {
  /** Timeout in ms for every shell command spawned by the server. */
  commandTimeoutMs: number;
  /** Hard max stdout/stderr captured per command. */
  maxBufferBytes: number;
  /** Default byte cap applied to tool output before truncation. */
  maxResponseBytes: number;
  /** Default cap on a single tool result in characters. */
  characterLimit: number;
  /** Parallel repo file reads. */
  readConcurrency: number;
  /** Parallel network calls (npm view etc.). */
  networkConcurrency: number;
  /** Hard cap for log tailing tools. */
  maxTailLines: number;
  /** Hard cap on files read by haru_read_codebase. */
  maxCodebaseFiles: number;
  /** Master switch for all mutating tools. */
  allowFileWrites: boolean;
  /** Switch for tools that execute user-supplied shell commands. */
  allowArbitraryCommands: boolean;
  /** pino log level. */
  logLevel: LogLevel;
}

export const config: McpConfig = {
  commandTimeoutMs: clampInt(process.env.MCP_COMMAND_TIMEOUT_MS, 1_000, 60_000, 30_000),
  maxBufferBytes: parseMb(process.env.MCP_MAX_BUFFER_MB, 10),
  maxResponseBytes: parseMb(process.env.MCP_MAX_RESPONSE_MB, 4),
  characterLimit: clampInt(process.env.MCP_CHARACTER_LIMIT, 1_000, 100_000, 25_000),
  readConcurrency: clampInt(process.env.MCP_READ_CONCURRENCY, 1, 10, 4),
  networkConcurrency: clampInt(process.env.MCP_NETWORK_CONCURRENCY, 1, 10, 2),
  maxTailLines: clampInt(process.env.MCP_MAX_TAIL_LINES, 100, 5_000, 500),
  maxCodebaseFiles: clampInt(process.env.MCP_MAX_CODEBASE_FILES, 10, 2_000, 200),
  // Default to safe (writes off, arbitrary commands off). Operators must opt in.
  allowFileWrites: parseBool(process.env.MCP_ALLOW_FILE_WRITES, false),
  allowArbitraryCommands: parseBool(process.env.MCP_ALLOW_ARBITRARY_COMMANDS, false),
  logLevel,
};

export const projectRoot = process.cwd();
export const SERVER_NAME = 'haru-mcp-server';
export const SERVER_VERSION = '5.0.0';

// ----- single-source path guard -----

/**
 * Resolve a user-supplied path against the project root and reject anything
 * that escapes it. Returns the absolute, validated path.
 */
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
