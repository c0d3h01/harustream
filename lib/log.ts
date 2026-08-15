// Server-side structured logging built on pino.
//
// Output is human-readable (pino-pretty) in development and JSON in
// production so it can be shipped to any log aggregator. The level is
// controlled by LOG_LEVEL and defaults to `debug` in dev / `info` in prod.
// Every child logger carries a `service` label and callers can attach their
// own context (request id, provider, route, …) for traceability.
//
// Edge note: middleware/proxy runs on the edge runtime, which cannot spawn
// the pino-pretty worker thread, so we fall back to plain JSON there.

import { type Level, type Logger, pino } from 'pino';

const IS_EDGE = process.env.NEXT_RUNTIME === 'edge';
const IS_DEV = process.env.NODE_ENV !== 'production';

const LEVEL: Level = (() => {
  const configured = process.env.LOG_LEVEL?.toLowerCase();
  if (configured === 'fatal') return 'fatal';
  if (configured === 'error') return 'error';
  if (configured === 'warn') return 'warn';
  if (configured === 'info') return 'info';
  if (configured === 'debug') return 'debug';
  if (configured === 'trace') return 'trace';
  return IS_DEV ? 'debug' : 'info';
})();

export const logger: Logger = pino({
  level: LEVEL,
  base: { service: 'harustreams' },
  ...(IS_DEV && !IS_EDGE
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:HH:MM:ss',
            ignore: 'pid,hostname,service',
          },
        },
      }
    : {}),
});

// Child logger scoped to a sub-system, e.g. `logger.child({ scope: 'provider' })`.
export function scopeLogger(scope: string, context: Record<string, unknown> = {}): Logger {
  return logger.child({ scope, ...context });
}
