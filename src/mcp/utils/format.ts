import { config } from '../config.js';

/**
 * Hard-truncate a string to a byte budget and append a clear notice.
 * Uses Buffer math so the result is always under the cap regardless of UTF-8 expansion.
 */
export function truncateOutput(text: string, maxBytes: number = config.maxResponseBytes): string {
  if (!text) return text;
  const buf = Buffer.from(text, 'utf8');
  if (buf.length <= maxBytes) return text;
  const reserve = 160;
  const budget = Math.max(1, maxBytes - reserve);
  const cut = buf.subarray(0, budget).toString('utf8');
  return (
    `${cut}\n\n` +
    `...[truncated: original ${buf.length} bytes -> shown ${Buffer.byteLength(cut, 'utf8')} bytes; ` +
    `narrow query or raise MCP_MAX_RESPONSE_MB to see more]`
  );
}

/** Apply the global response byte cap to a text block. */
export function capText(text: string): string {
  return truncateOutput(text, config.maxResponseBytes);
}

/** Render a payload as pretty JSON. */
export function renderJson(payload: unknown): string {
  return JSON.stringify(payload, null, 2);
}
