import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import { pino } from 'pino';
import type { z } from 'zod';
import { config, SERVER_NAME, SERVER_VERSION } from './config.js';

export { SERVER_NAME, SERVER_VERSION };

import type { ContentBlock, TextBlock, ToolResult } from './types.js';
import { capText } from './utils/format.js';

// ----- server instance + logger -----

export const server = new McpServer({
  name: SERVER_NAME,
  version: SERVER_VERSION,
  description:
    'AI Agent-Optimized MCP Server for Codebase Analysis, Editing, Quality Gates, and Root-Cause Fixes',
});

export const logger = pino({ level: config.logLevel, base: undefined }, process.stderr);

// ----- result helpers -----

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function toolError(message: string, hint?: string): ToolResult {
  const guidance = hint ? ` ${hint}` : '';
  return {
    content: [{ type: 'text', text: `Error: ${message}.${guidance}` }],
    isError: true,
  };
}

export function okText(text: string): ToolResult {
  return { content: [{ type: 'text', text }] };
}

export function okStructured<T extends Record<string, unknown>>(
  payload: T,
  text: string,
): ToolResult {
  return { content: [{ type: 'text', text }], structuredContent: payload };
}

function applyLimits(result: ToolResult): ToolResult {
  return {
    ...result,
    content: result.content.map((block) => {
      if (block.type === 'text' && typeof (block as TextBlock).text === 'string') {
        return { type: 'text', text: capText((block as TextBlock).text) } as TextBlock;
      }
      return block as ContentBlock;
    }),
  };
}

// ----- registration wrapper -----

let registeredToolCount = 0;
const registeredNames: string[] = [];
export function getRegisteredToolCount(): number {
  return registeredToolCount;
}
export function getRegisteredToolNames(): readonly string[] {
  return registeredNames;
}

export interface ToolRegistration<S extends z.ZodTypeAny> {
  name: string;
  title: string;
  description: string;
  inputSchema: S;
  annotations: ToolAnnotations;
  outputSchema?: z.ZodTypeAny;
  callback: (args: z.infer<S>) => Promise<ToolResult>;
}

type ToolCallback = (args: Record<string, unknown>) => Promise<ToolResult>;

export function tool<S extends z.ZodTypeAny>(def: ToolRegistration<S>): void {
  registeredToolCount += 1;
  const cb: ToolCallback = async (raw) => {
    const startedAt = Date.now();
    try {
      const result = await def.callback(raw as z.infer<S>);
      logger.debug({
        event: 'tool',
        tool: def.name,
        ms: Date.now() - startedAt,
        ok: !result?.isError,
      });
      return applyLimits(result);
    } catch (error) {
      const message = errMessage(error);
      logger.warn({
        event: 'tool_error',
        tool: def.name,
        ms: Date.now() - startedAt,
        err: message,
      });
      return toolError(`Unexpected failure in ${def.name}`, `Details: ${message}`);
    }
  };

  const opts: {
    title: string;
    description: string;
    inputSchema: S;
    annotations: ToolAnnotations;
    outputSchema?: z.ZodTypeAny;
  } = {
    title: def.title,
    description: def.description,
    inputSchema: def.inputSchema,
    annotations: def.annotations,
  };
  if (def.outputSchema) opts.outputSchema = def.outputSchema;

  // The SDK's registerTool is overloaded on its inputSchema type; the runtime
  // accepts any Zod schema, so we cast through unknown.
  (server.registerTool as unknown as (name: string, cfg: typeof opts, cb: ToolCallback) => unknown)(
    def.name,
    opts,
    cb,
  );
  registeredNames.push(def.name);
}
