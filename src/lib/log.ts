/** biome-ignore-all lint/suspicious/noConsole: console-backed logger; this file IS the logging facility. */
// Minimal structured logger (console-backed). Replaces pino.

const LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const;
type Level = (typeof LEVELS)[number];

const IS_DEV = process.env.NODE_ENV !== 'production';

function configuredLevel(): Level {
  const raw = process.env.LOG_LEVEL?.toLowerCase() as Level | undefined;
  if (raw && (LEVELS as readonly string[]).includes(raw)) return raw;
  return IS_DEV ? 'debug' : 'info';
}

const ACTIVE: Level = configuredLevel();

function enabled(level: Level): boolean {
  return LEVELS.indexOf(level) <= LEVELS.indexOf(ACTIVE);
}

export interface ScopedLogger {
  fatal: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  trace: (...args: unknown[]) => void;
}

function emit(level: Level, scope: string, context: Record<string, unknown>, args: unknown[]) {
  if (!enabled(level)) return;
  const method =
    level === 'fatal' || level === 'error'
      ? console.error
      : level === 'warn'
        ? console.warn
        : level === 'debug' || level === 'trace'
          ? console.debug
          : console.info;
  method(`[${scope}]`, ...args, Object.keys(context).length > 0 ? context : '');
}

function makeLogger(scope: string, context: Record<string, unknown> = {}): ScopedLogger {
  return {
    fatal: (...args) => emit('fatal', scope, context, args),
    error: (...args) => emit('error', scope, context, args),
    warn: (...args) => emit('warn', scope, context, args),
    info: (...args) => emit('info', scope, context, args),
    debug: (...args) => emit('debug', scope, context, args),
    trace: (...args) => emit('trace', scope, context, args),
  };
}

export function scopeLogger(scope: string, context: Record<string, unknown> = {}): ScopedLogger {
  return makeLogger(scope, context);
}
