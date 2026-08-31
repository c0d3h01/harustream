// ─── Live Provider Reporter ─────────────────────────────────────────────────
// Custom vitest reporter for the live provider smoke suite, giving a live,
// colourised, per-provider view of exactly what is happening under the hood
// (which endpoint, what it resolved, how long it took).
//
// Live detail originates in the test bodies (tests/live/providers.test.ts),
// which publish provider/endpoint/status/ms/detail/error into their test meta.
// That meta is not reliably visible on the reporter TestCase at
// onTestCaseResult time, so this reporter reads the authoritative
// `onTaskUpdate` packs instead: [testId, TaskResult, TaskMeta][]. Test ids are
// registered at onTestCaseReady and resolved from the packs.
//
// Wired in vitest.live.config.ts (pnpm test:providers).
import type { Reporter, TaskResult } from 'vitest';

type OnReady = NonNullable<Reporter['onTestCaseReady']>;
type TestCase = Parameters<OnReady>[0];
type OnUpdate = NonNullable<Reporter['onTaskUpdate']>;
type TaskResultPack = Parameters<OnUpdate>[0][number];

type HopStatus = 'ok' | 'skipped' | 'error';

interface Row {
  providerId: string;
  endpoint: string;
  status: HopStatus;
  ms?: number;
  detail?: string;
  error?: string;
}

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

const ICON: Record<HopStatus, string> = { ok: '✓', skipped: '○', error: '✗' };

function endpointLabel(name: string): string {
  return name.split(' ')[0] ?? name;
}

function providerIdOf(test: TestCase): string {
  const segment = test.fullName
    .split('>')
    .map((part) => part.trim())
    .find((part) => part.startsWith('live: '));
  return (segment ?? test.fullName.split('>').pop() ?? 'provider').replace(/^live:\s*/i, '').trim();
}

function visibleLength(s: string): number {
  // ANSI CSI sequences are ESC [ <n> m; count every other character.
  let len = 0;
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) === 27) {
      while (i < s.length && s[i] !== 'm') i++;
      continue;
    }
    len++;
  }
  return len;
}

function pad(s: string, width: number): string {
  const gap = width - visibleLength(s);
  return gap > 0 ? `${s}${' '.repeat(gap)}` : s;
}

function msLabel(ms?: number): string {
  if (ms === undefined) return '— ';
  if (ms < 1) return `${pad('<1', 5)} ms`;
  if (ms < 1000) return `${pad(String(Math.round(ms)), 5)} ms`;
  return `${pad((ms / 1000).toFixed(2), 5)} s `;
}

export class LiveReporter implements Reporter {
  private readonly cases = new Map<string, { name: string; providerId: string }>();
  private readonly rows = new Map<string, Row[]>();
  private readonly order: string[] = [];
  private readonly running = new Map<string, string>();
  private readonly settled = new Set<string>();
  private readonly lineAt = new Map<string, number>();
  private printed = 0;
  private started = 0;

  onTestRunStart(): void {
    this.started = Date.now();
    process.stdout.write(`\n${C.bold}${C.cyan}  LIVE PROVIDER API SWEEP${C.reset}\n`);
    process.stdout.write(
      `  ${C.gray}endpoint-by-endpoint verdicts against live sites · pnpm test:providers${C.reset}\n\n`,
    );
  }

  onTestCaseReady(test: TestCase): void {
    const providerId = providerIdOf(test);
    this.cases.set(test.id, { name: test.name, providerId });
    this.running.set(test.id, `${providerId} · ${endpointLabel(test.name)}`);
    this.lineAt.set(test.id, this.printed);
    this.printed++;
    process.stdout.write(
      `  ${C.dim}·${C.reset} ${pad(endpointLabel(test.name), 26)}${C.dim}running…${C.reset}\n`,
    );
  }

  onTaskUpdate(packs: TaskResultPack[]): void {
    for (const [id, result, meta] of packs) {
      if (!this.cases.has(id) || this.settled.has(id)) continue;
      const row = this.takeResult(id, result, meta as Record<string, unknown>);
      if (!row) continue; // not settled yet (pending pack)
      this.settled.add(id);
      this.push(row);
      this.overwriteAt(id, this.streamLine(row));
    }
  }

  private overwriteAt(id: string, line: string): void {
    const idx = this.lineAt.get(id);
    if (idx === undefined) {
      this.lineAt.set(id, this.printed);
      process.stdout.write(`${line}\n`);
      this.printed++;
      return;
    }
    const up = this.printed - idx - 1;
    const upSeq = up > 0 ? `\u001b[${up}A` : '';
    const downSeq = up > 0 ? `\u001b[${up}B` : '';
    process.stdout.write(`${upSeq}\x1b[2K${line}\x1b[0m${downSeq}\n`);
  }

  private drainLeftover(): void {
    for (const id of [...this.running.keys()]) {
      const cs = this.cases.get(id);
      if (!cs) continue;
      this.running.delete(id);
      this.overwriteAt(
        id,
        `  ${C.dim}—${C.reset} ${pad(`${cs.providerId} · ${endpointLabel(cs.name)}`, 32)}${C.gray}not run${C.reset}`,
      );
    }
  }

  onTestRunEnd(): void {
    this.drainLeftover();
    this.reportBlocks();
    this.reportFailures();
    this.reportSummary();
  }

  private takeResult(
    id: string,
    result: TaskResult | undefined,
    meta: Record<string, unknown>,
  ): Row | undefined {
    if (
      !result ||
      (result.state !== 'pass' && result.state !== 'fail' && result.state !== 'skip')
    ) {
      return undefined;
    }
    const cs = this.cases.get(id);
    if (!cs) return undefined;
    const status: HopStatus =
      result.state === 'pass' ? 'ok' : result.state === 'skip' ? 'skipped' : 'error';
    const row: Row = {
      providerId: typeof meta.provider === 'string' ? meta.provider : cs.providerId,
      endpoint: typeof meta.endpoint === 'string' ? meta.endpoint : endpointLabel(cs.name),
      status,
      ms: typeof meta.ms === 'number' ? meta.ms : result.duration,
      detail: typeof meta.detail === 'string' ? meta.detail : undefined,
      error: typeof meta.error === 'string' ? meta.error : result.errors?.[0]?.message,
    };
    if (!row.detail && row.status === 'error') row.detail = row.error;
    return row;
  }

  private push(row: Row): void {
    if (!this.rows.has(row.providerId)) {
      this.rows.set(row.providerId, []);
      this.order.push(row.providerId);
    }
    this.rows.get(row.providerId)?.push(row);
  }

  private streamLine(row: Row): string {
    const icon =
      row.status === 'ok'
        ? `${C.green}${ICON.ok}${C.reset}`
        : row.status === 'error'
          ? `${C.red}${ICON.error}${C.reset}`
          : `${C.yellow}${ICON.skipped}${C.reset}`;
    const tagColor = row.status === 'error' ? C.red : row.status === 'skipped' ? C.yellow : C.reset;
    const who = `${tagColor}${row.providerId} · ${row.endpoint}${C.reset}`;
    const detailColor =
      row.status === 'error' ? C.red : row.status === 'skipped' ? C.yellow : C.gray;
    const detail = `${detailColor}${row.detail ?? ''}${C.reset}`;
    return `  ${msLabel(row.ms)}${icon} ${pad(who, 32)}${detail}`;
  }

  private reportBlocks(): void {
    process.stdout.write(
      `\n${C.bold}${C.gray}──────────────────────────────────────────────────────────${C.reset}\n`,
    );
    for (const providerId of this.order) {
      const rows = this.rows.get(providerId) ?? [];
      const ok = rows.filter((r) => r.status === 'ok').length;
      const failed = rows.filter((r) => r.status === 'error').length;
      const skipped = rows.length - ok - failed;
      const verdict = failed === 0 ? `${C.green}✔${C.reset}` : `${C.red}✘${C.reset}`;
      const head = `${C.bold}${C.cyan}── ${providerId} ${'─'.repeat(Math.max(2, 46 - providerId.length))}${C.reset}`;
      const over = `${ok}/${rows.length} ok${skipped > 0 ? ` · ${skipped} skipped` : ''}`;
      const color = failed === 0 ? C.green : C.red;
      process.stdout.write(`\n  ${verdict} ${head} ${color}${over}${C.reset}\n`);
      for (const row of rows) {
        process.stdout.write(`  ${this.streamLine(row).trimEnd()}\n`);
      }
    }
  }

  private reportFailures(): void {
    const failures = this.order
      .map((providerId) => ({ providerId, rows: this.rows.get(providerId) ?? [] }))
      .filter(({ rows }) => rows.some((r) => r.status === 'error'));
    if (failures.length === 0) return;
    process.stdout.write(`\n${C.bold}${C.red}  PROVIDER FAILURES${C.reset}\n`);
    for (const { providerId, rows } of failures) {
      for (const row of rows) {
        process.stdout.write(
          `${C.red}  ✗${C.reset} ${C.bold}${providerId}.${row.endpoint}${C.reset}\n`,
        );
        process.stdout.write(
          `      ${C.red}${row.error ?? row.detail ?? 'unknown error'}${C.reset}\n`,
        );
      }
    }
  }

  private reportSummary(): void {
    const all = [...this.rows.values()].flat();
    const ok = all.filter((r) => r.status === 'ok').length;
    const failed = all.filter((r) => r.status === 'error').length;
    const skipped = all.length - ok - failed;
    const color = failed === 0 ? C.green : C.red;
    const elapsed = ((Date.now() - this.started) / 1000).toFixed(1);
    process.stdout.write(
      `\n${C.bold}  SWEEP DONE${C.reset} · ${color}${ok} ok${C.reset} · ` +
        (failed > 0 ? `${C.red}${failed} failed${C.reset}` : `${color}${failed} failed${C.reset}`) +
        ` · ${C.yellow}${skipped} skipped${C.reset} · ${all.length} endpoints · ${elapsed}s\n\n`,
    );
  }
}
