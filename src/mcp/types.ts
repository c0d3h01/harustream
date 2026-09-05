import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';

// ----- annotation presets -----

export const READ_ONLY: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export const WRITE_DESTRUCTIVE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false,
};

export const READ_OPEN_WORLD: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

// ----- result types -----

export interface TextBlock {
  type: 'text';
  text: string;
}

export type ContentBlock = TextBlock | { type: string; [k: string]: unknown };

export interface ToolResult {
  content: ContentBlock[];
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
}

// ----- response format -----

export const RESPONSE_FORMATS = ['markdown', 'json'] as const;
export type ResponseFormat = (typeof RESPONSE_FORMATS)[number];

// ----- log file guard used by ops tools -----

export function assertSafeLogFile(logFile: string): string {
  if (typeof logFile !== 'string' || logFile.trim() === '') {
    throw new Error('logFile must be a non-empty path');
  }
  if (logFile.length > 512) throw new Error('logFile exceeds 512 characters');
  if (logFile.includes('..')) throw new Error('logFile must not contain ".."');
  if (logFile.startsWith('/') || /^[A-Za-z]:[\\/]/.test(logFile)) {
    throw new Error('logFile must be a relative path');
  }
  return logFile;
}
