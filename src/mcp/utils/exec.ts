import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { config, projectRoot } from '../config.js';

const execAsync = promisify(exec);

export interface CmdResult {
  stdout: string;
  stderr: string;
  code: number;
}

const MAX_ARG_LEN = 4096;

/**
 * Escape a value for safe inclusion inside a single-quoted shell string.
 * Throws on empty, oversized, or control-character values.
 */
export function esc(value: unknown): string {
  const str = String(value);
  if (str.length > MAX_ARG_LEN) {
    throw new Error('Shell argument exceeds 4096 characters');
  }
  for (let i = 0; i < str.length; i += 1) {
    const code = str.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) {
      throw new Error('Shell argument contains control characters');
    }
  }
  return `'${str.replace(/'/g, "'\\''")}'`;
}

/**
 * Run a shell command. NEVER throws — always resolves to a result object.
 * Use this everywhere the tool wants to keep going on failure.
 */
export async function runCmd(
  command: string,
  options: { cwd?: string; maxBuffer?: number; timeout?: number } = {},
): Promise<CmdResult> {
  if (typeof command !== 'string' || command.trim() === '') {
    return { stdout: '', stderr: 'runCmd: empty command', code: 1 };
  }
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: options.cwd || projectRoot,
      maxBuffer: options.maxBuffer || config.maxBufferBytes,
      timeout: options.timeout || config.commandTimeoutMs,
      env: { ...process.env, FORCE_COLOR: '0' },
    });
    return { stdout: stdout ?? '', stderr: stderr ?? '', code: 0 };
  } catch (error) {
    const f = error as { stdout?: string; stderr?: string; message?: string; code?: number };
    return {
      stdout: f.stdout ?? '',
      stderr: f.stderr ?? f.message ?? `Command failed: ${command}`,
      code: typeof f.code === 'number' ? f.code : 1,
    };
  }
}

/** Quick check: does a JS module resolve from the project root? */
export async function hasModule(moduleName: string): Promise<boolean> {
  const r = await runCmd(`node -e "require.resolve(${esc(moduleName)})"`, { timeout: 5_000 });
  return r.code === 0;
}
