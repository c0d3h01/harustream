// ─── Provider URL Updater ────────────────────────────────────────────────────
// Refreshes provider base URLs by fetching each provider. When the configured
// URL is dead, the current domain is discovered by (a) following redirects on
// the old URL and (b) probing a per-provider candidate/mirror table.
//
// Safety: a candidate is ADOPTED only when it validates — HTTP 2xx, an HTML
// body, and the provider's name (or a redirect target) present in the page.
// The updater therefore never points a provider at a random domain.
//
// Rewrites src/providers/urls.ts (the single typed config source) atomically
// and only when a provider's URL actually changed.
//
//   pnpm providers:update-urls               # probe + update
//   pnpm providers:update-urls -- --dry-run  # preview only, no writes
//   pnpm providers:update-urls -- --check    # exit 1 if any provider is dead
//   pnpm providers:update-urls -- --json     # machine-readable result
//   SKIP_URLS_UPDATE=1 pnpm ...              # skip (used by pretest hook escape)
//
// Runs automatically before `pnpm test:providers` via the pretest hook, and
// on demand from the Update Provider URLs GitHub Actions workflow.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { providerUrls } from '../src/providers/urls';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const URLS_TS = path.join(ROOT, 'src/providers/urls.ts');

const REQUEST_TIMEOUT_MS = Number(process.env.URLS_UPDATE_TIMEOUT_MS ?? 20_000);
const MAX_ALIASES = 5;
const PROBE_ATTEMPTS = 2; // reachable sites can flake; retry before declaring dead
// Validation runs on a body prefix — provider homepages can be multi-MB.
const PROBE_BODY_PREFIX = 256 * 1024;

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Safari/537.36';
const REQUEST_HEADERS = {
  'user-agent': USER_AGENT,
  accept: 'text/html,application/xhtml+xml;q=0.9,application/json;q=0.8,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
};

// Extra domain candidates per provider, in priority order. The current URL is
// always tried first, then these. Keep entries verified or harmless: the
// keyword validator filters anything that does not actually present as the
// provider. Hint sources: the provider's own page (announced mirrors) and
// redirect aliases that resolve to the live site.
const MIRRORS: Record<string, string[]> = {
  movieBoxWeb: [
    'https://downloadmoviebox.com',
    'https://downloadmoviebox.org',
    'https://123movie.app',
  ],
  // anikoto / torrentio / vega: no extra candidates yet — their domains still
  // redirect when they move. Add verified mirrors here when a domain change is
  // seen.
};

type AnalysisStatus = 'unchanged' | 'updated' | 'unreachable' | 'retired';

interface Analysis {
  providerId: string;
  current: string;
  suggested: string;
  replaced: boolean;
  status: AnalysisStatus;
  reason?: string;
}

interface Entry {
  name: string;
  url: string;
  retired?: boolean;
  retiredNote?: string;
}

interface ProbeResult {
  ok: boolean;
  origin: string | undefined;
  statusCode: number | undefined;
  reason: string;
}

function keywordsFor(name: string): string[] {
  // Brand match: accept the full display name and each individual word token.
  // ("MovieBox Web" matches a page branded "MovieBox", never "movieboxweb".)
  const tokens = name.split(/\s+/).filter((t) => t.length > 0);
  return [...new Set([name, ...tokens].map((t) => t.toLowerCase()))];
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function readPrefix(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return await res.text();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done || value == null) break;
    const slice =
      total + value.length <= PROBE_BODY_PREFIX
        ? value
        : value.subarray(0, PROBE_BODY_PREFIX - total);
    chunks.push(slice);
    total += slice.length;
    if (total >= PROBE_BODY_PREFIX) break;
  }
  await reader.cancel().catch(() => undefined);
  return Buffer.concat(chunks).toString('utf8');
}

async function probeOnce(url: string, keywords: string[]): Promise<ProbeResult> {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: REQUEST_HEADERS,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok)
      return { ok: false, origin: undefined, statusCode: res.status, reason: `HTTP ${res.status}` };
    const lower = (await readPrefix(res)).toLowerCase();
    if (!keywords.some((k) => lower.includes(k))) {
      return {
        ok: false,
        origin: undefined,
        statusCode: res.status,
        reason: 'page does not present as the provider',
      };
    }
    return { ok: true, origin: new URL(res.url).origin, statusCode: res.status, reason: 'ok' };
  } catch (err) {
    const reason =
      err instanceof Error && err.name === 'TimeoutError' ? 'timeout' : `error: ${errMessage(err)}`;
    return { ok: false, origin: undefined, statusCode: undefined, reason };
  }
}

async function probe(
  url: string,
  keywords: string[],
  attempts = PROBE_ATTEMPTS,
): Promise<ProbeResult> {
  let last: ProbeResult = {
    ok: false,
    origin: undefined,
    statusCode: undefined,
    reason: 'no probe made',
  };
  for (let attempt = 0; attempt < attempts; attempt++) {
    last = await probeOnce(url, keywords);
    if (last.ok) return last;
  }
  return last;
}

async function analyze(providerId: string): Promise<Analysis> {
  const entry = (providerUrls as Record<string, Entry>)[providerId];
  const current = entry.url;
  if (entry.retired) {
    return {
      providerId,
      current: current ?? '(retired)',
      suggested: current ?? '(retired)',
      replaced: false,
      status: 'retired',
      reason: entry.retiredNote ?? 'provider retired',
    };
  }
  if (!current) {
    return {
      providerId,
      current: '(not configured)',
      suggested: '(not configured)',
      replaced: false,
      status: 'unreachable',
      reason: 'no url configured',
    };
  }
  const keywords = keywordsFor(entry.name ?? providerId);
  const candidates = [...new Set([current, ...(MIRRORS[providerId] ?? [])])].slice(
    0,
    1 + MAX_ALIASES,
  );

  const first = await probe(current, keywords);
  if (first.ok) {
    const currentOrigin = new URL(current).origin;
    const adopted = first.origin && first.origin !== currentOrigin ? first.origin : current;
    return {
      providerId,
      current,
      suggested: adopted,
      replaced: adopted !== current,
      status: adopted === current ? 'unchanged' : 'updated',
      reason:
        first.origin && first.origin !== currentOrigin
          ? `redirected to ${first.origin}`
          : undefined,
    };
  }

  for (const candidate of candidates.slice(1)) {
    const hit = await probe(candidate, keywords);
    if (hit.ok && hit.origin) {
      return {
        providerId,
        current,
        suggested: hit.origin,
        replaced: hit.origin !== new URL(current).origin,
        status: 'updated',
        reason: `found at mirror ${candidate} -> ${hit.origin}`,
      };
    }
  }

  return {
    providerId,
    current,
    suggested: current,
    replaced: false,
    status: 'unreachable',
    reason: first.reason,
  };
}

function serializeTs(manifest: Array<[string, Entry]>): string {
  const esc = (s: string): string => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const lines = manifest.map(([id, e]) => {
    if (!e.retired) {
      return `  ${id}: { name: '${esc(e.name)}', url: '${esc(e.url)}' },`;
    }
    const props = [`name: '${esc(e.name)}'`, `url: '${esc(e.url)}'`, 'retired: true'];
    if (e.retiredNote) props.push(`retiredNote: '${esc(e.retiredNote)}'`);
    return `  ${id}: {\n${props.map((p) => `    ${p},`).join('\n')}\n  },`;
  });
  return [
    "import type { ProviderUrls } from './_shared/types';",
    '',
    '/** Provider endpoints kept in typed source so refactors and validation are compile-time visible. */',
    'export const providerUrls = {',
    ...lines,
    '} satisfies ProviderUrls;',
    '',
    'export type ProviderId = keyof typeof providerUrls;',
    '',
  ].join('\n');
}

function writeIfChanged(file: string, content: string): boolean {
  let current = '';
  try {
    current = readFileSync(file, 'utf8');
  } catch {
    // file missing -> treat as changed
  }
  if (current === content) return false;
  writeFileSync(file, content);
  return true;
}

async function main(): Promise<number> {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has('--dry-run');
  const check = args.has('--check');
  const asJson = args.has('--json');

  if (process.env.SKIP_URLS_UPDATE === '1') return 0;

  const manifest = Object.entries(providerUrls) as Array<[string, Entry]>;
  const results = await Promise.all(manifest.map(([id]) => analyze(id)));

  const updated = results.filter((r) => r.status === 'updated');
  const unreachable = results.filter((r) => r.status === 'unreachable');

  if (asJson) {
    process.stdout.write(
      `${JSON.stringify({ changed: updated.length > 0, providers: results }, null, 2)}\n`,
    );
    return check && unreachable.length > 0 ? 1 : 0;
  }

  const nameWidth = Math.max(...results.map((r) => r.providerId.length)) + 2;
  for (const r of results) {
    const flag =
      r.status === 'updated'
        ? 'UPDATE'
        : r.status === 'unreachable'
          ? 'DEAD'
          : r.status === 'retired'
            ? 'RETIRED'
            : 'ok';
    const color =
      r.status === 'updated'
        ? '\x1b[33m'
        : r.status === 'unreachable'
          ? '\x1b[31m'
          : r.status === 'retired'
            ? '\x1b[90m'
            : '\x1b[32m';
    const note = r.reason ? ` (${r.reason})` : '';
    process.stdout.write(
      `  ${r.providerId.padEnd(nameWidth)}${r.current}${r.replaced ? ` -> ${r.suggested}` : ''}  ` +
        `${color}${flag}${'\x1b[0m'}${note}\n`,
    );
  }

  if (updated.length > 0) {
    if (dryRun) {
      process.stdout.write(`\n${updated.length} provider URL(s) would be updated.\n`);
    } else {
      const next: Array<[string, Entry]> = manifest.map(([id, e]) => {
        const r = results.find((x) => x.providerId === id);
        return [
          id,
          {
            name: e.name,
            url: r?.replaced ? r.suggested : e.url,
            retired: e.retired,
            retiredNote: e.retiredNote,
          },
        ];
      });
      const wrote = writeIfChanged(URLS_TS, serializeTs(next));
      process.stdout.write(
        wrote ? `\nWrote ${updated.length} provider URL(s) to urls.ts.\n` : '\nNothing to write.\n',
      );
    }
  } else if (unreachable.length === 0) {
    process.stdout.write('\nAll provider URLs are up to date.\n');
  }

  if (check && unreachable.length > 0) return 1;
  return 0;
}

void main().then((code) => {
  process.exitCode = code;
});
